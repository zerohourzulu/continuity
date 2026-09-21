"""Actual adapter process checks. Runs locally without network or private fixtures."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('harness', ROOT / 'conformance/run.py')
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)
NODE = os.environ.get('CONTINUITY_NODE', 'node')

class Comparison(unittest.TestCase):
    def test_exact_representations(self):
        cases = [({'value': None}, {}), (True, 1), (False, 0), (1, 1.0),
                 ([], {}), ([1, 2], [2, 1]), ([1], [1, 1]),
                 ({'$continuity.bigint': '1'}, {'$continuity.bigint': '01'}),
                 ({'$continuity.bigint': '1'}, {'$continuity.bigint': '1', 'extra': 0})]
        for expected, actual in cases:
            with self.subTest(expected=expected, actual=actual):
                self.assertTrue(harness.differences(expected, actual))

    def test_declared_projection_preserves_extensions(self):
        self.assertEqual(harness.differences({'value': None}, {'value': None, 'metadata': True}), [])
        self.assertEqual(harness.differences({'a': [False, 0, None]}, {'a': [False, 0, None]}), [])

class ProcessBounds(unittest.TestCase):
    def check_failure(self, source, expected, **limits):
        adapter = harness.Adapter([sys.executable, '-u', '-c', source], timeout=0.5, **limits)
        started = time.monotonic()
        try:
            with self.assertRaisesRegex(harness.AdapterError, expected):
                adapter.ask({'op': 'describe'})
        finally:
            adapter.close()
        self.assertIsNotNone(adapter.process.poll())
        self.assertLess(time.monotonic() - started, 4)

    def test_stalled_read(self):
        self.check_failure('import time;time.sleep(60)', 'TIMEOUT')

    def test_oversized_stdout(self):
        self.check_failure("import sys;sys.stdin.readline();print('x'*30000)", 'RESPONSE_LIMIT', max_response=1024)

    def test_unterminated_oversized_stdout(self):
        self.check_failure("import sys,time;sys.stdin.readline();sys.stdout.write('x'*30000);sys.stdout.flush();time.sleep(60)", 'RESPONSE_LIMIT', max_response=1024)

    def test_flooded_stderr(self):
        self.check_failure("import sys,time;sys.stdin.readline();sys.stderr.write('x'*30000);sys.stderr.flush();time.sleep(60)", 'STDERR_LIMIT', max_stderr=1024)

    def test_invalid_envelopes(self):
        for raw, error in [('not-json', 'INVALID_JSON'), ('[]', 'INVALID_ENVELOPE'),
            ('{"ok":1,"result":{}}', 'INVALID_ENVELOPE'),
            ('{"ok":true,"ok":false,"result":{}}', 'INVALID_JSON'),
            ('{"ok":true,"result":[],"extra":true}', 'INVALID_ENVELOPE'),
            ('{"ok":true,"result":[]}', 'INVALID_RESULT'),
            ('{"ok":true,"result":{"n":NaN}}', 'INVALID_JSON'),
            ('{"ok":true,"result":{"n":1e400}}', 'INVALID_JSON'),
            ('{"ok":false,"error":"failure"}', 'ADAPTER_REPORTED_ERROR')]:
            with self.subTest(raw=raw):
                self.check_failure('import sys;sys.stdin.readline();print('+repr(raw)+')', error)

    def test_import_failure(self):
        self.check_failure('import module_that_does_not_exist_continuity', 'ADAPTER_EOF|ADAPTER_CLOSED_INPUT')

    def test_request_limit(self):
        self.check_failure('import time;time.sleep(60)', 'REQUEST_LIMIT', max_request=4)

    def test_blocked_write_has_deadline(self):
        adapter = harness.Adapter([sys.executable, '-u', '-c', 'import time;time.sleep(60)'], timeout=0.2)
        try:
            with self.assertRaisesRegex(harness.AdapterError, 'TIMEOUT'):
                adapter.ask({'op': 'x', 'body': 'x' * 2000000})
        finally:
            adapter.close()
        self.assertIsNotNone(adapter.process.poll())

class Integration(unittest.TestCase):
    def run_harness(self, command, *options):
        p = subprocess.run([sys.executable, str(ROOT/'conformance/run.py'), '--json', *options, '--', *command],
                           cwd=ROOT, capture_output=True, text=True, timeout=90)
        return p.returncode, json.loads(p.stdout)

    def test_reference_matches_original_vectors(self):
        code, report = self.run_harness([NODE, 'conformance/adapters/node.mjs'])
        self.assertEqual(code, 0, report)
        self.assertEqual(report['status'], 'MATCH')
        self.assertEqual(report['passed'], report['selected'])
        self.assertGreater(report['passed'], 0)
        self.assertEqual(report['errors'], 0)
        self.assertEqual(report['notRun'], [])

    def test_permissive_adapter_is_semantic_mismatch_not_execution_failure(self):
        source = (ROOT/'conformance/adapters/node.mjs').read_text()
        old = "'../../packages/core-0.2/src/core/index.ts'"
        self.assertEqual(source.count(old), 1)
        source = source.replace(old, repr((ROOT/'packages/core-0.2/src/core/index.ts').as_uri()))
        needle = 'decision: result.decision,'
        self.assertEqual(source.count(needle), 1)
        source = source.replace(needle, 'decision: result.decision === "DENY" ? "ALLOW" : result.decision,')
        with tempfile.TemporaryDirectory(prefix='continuity-negative-') as tmp:
            path = Path(tmp)/'permissive.mjs';path.write_text(source)
            code, report = self.run_harness([NODE, str(path)])
        self.assertEqual(code, 1, report)
        self.assertEqual(report['status'], 'MISMATCH')
        self.assertEqual(report['errors'], 0)
        self.assertEqual(report['notRun'], [])
        self.assertTrue(report['implementation']['implementation'])
        failures = [r for r in report['results'] if r['status'] == 'MISMATCH']
        expected = [v['id'] for v in json.loads((ROOT/'conformance/vectors.json').read_text()) if v['expect'].get('decision') == 'DENY']
        self.assertEqual([r['id'] for r in failures], expected)
        self.assertTrue(all(r['differences'] == [".decision: expected 'DENY', got 'ALLOW'"] for r in failures))

    def test_execution_errors_are_structured_and_distinct(self):
        samples = [([NODE, '/nonexistent-continuity-adapter.mjs'], ()),
            ([sys.executable,'-u','-c','import time;time.sleep(60)'], ('--timeout','0.2')),
            ([sys.executable,'-u','-c',"import sys;sys.stdin.readline();print('x'*10000)"], ('--max-response-bytes','1024')),
            ([sys.executable,'-u','-c',"import sys;sys.stdin.readline();print('not-json')"], ())]
        for command, options in samples:
            with self.subTest(command=command):
                code, report = self.run_harness(command, *options)
                self.assertEqual(code, 2, report)
                self.assertEqual(report['status'], 'EXECUTION_ERROR')
                self.assertEqual(report['errors'], 1)
                self.assertEqual(report['mismatched'], 0)

    def test_zero_selected_is_error(self):
        code, report = self.run_harness([NODE,'conformance/adapters/node.mjs'], '--filter','no-such-vector')
        self.assertEqual(code, 2)
        self.assertEqual(report['error'], 'NO_VECTORS_SELECTED')

    def test_wire_amounts_and_malformed_tags(self):
        vectors = json.loads((ROOT/'conformance/vectors.json').read_text())
        template = next(v for v in vectors if v['id'] == 'quantitative/amount-required')
        histories = {'mandate-quantitative-only': json.loads((ROOT/'tests/fixtures/mandate-history.json').read_text())[:6]}
        request = harness.build_request(template, histories)
        adapter = harness.Adapter([NODE,'conformance/adapters/node.mjs'])
        try:
            # The fixture grants a 2500 per-transaction ceiling; omission is distinct from zero.
            for amount, decision in [('0','ALLOW'), ('2500','ALLOW'), ('2501','DENY'), (str((1<<256)-1),'DENY')]:
                request['request']['amount'] = {'$continuity.bigint': amount}
                answer = adapter.ask(request)['result']
                self.assertEqual(answer['decision'], decision, answer)
            del request['request']['amount']
            self.assertEqual(adapter.ask(request)['result']['decision'], 'DENY')
        finally:
            adapter.close()
        for tag in [{'$continuity.bigint':'01'}, {'$continuity.bigint':'1','extra':0},
                    {'$continuity.bigint':str(1<<256)}, {'$continuity.bigint':True}]:
            adapter = harness.Adapter([NODE,'conformance/adapters/node.mjs'])
            try:
                request['request']['amount'] = tag
                with self.assertRaisesRegex(harness.AdapterError, 'INVALID_QUANTITY_ENCODING'):
                    adapter.ask(request)
            finally:
                adapter.close()

if __name__ == '__main__':
    unittest.main()
