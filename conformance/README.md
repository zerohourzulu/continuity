# Run the retained vectors

From the package root, with Node24 and Python3.9+ on macOS or Linux:

```sh
python3 -B conformance/run.py --json -- node conformance/adapters/node.mjs
python3 -B -m unittest discover -s conformance -p test_runner.py -v
```

The second command checks both a working reference adapter and a deliberately permissive variant, as well as broken imports, malformed responses, timeout and output limits. It verifies the intended DENY-to-ALLOW differences; a nonzero exit alone is insufficient. Use `node tools/test.mjs` for this and the selected Core regression suites together.

The34 retained vectors comprise19authorization,11replay and4SURVIVES cases. Their exact original bytes and `MANIFEST.json` are preserved from contribution `abfaacd`. They were generated against the reference engine and provide finite regression evidence, not an independent semantic oracle, complete protocol specification or independent implementation. Historical normative language in the manifest does not supersede current versioned contracts. Expectations are not regenerated during CI.

Exit0 means every selected vector matched; exit1 means completed adapter responses disagreed semantically; exit2 means input/setup/transport/cleanup failure. A zero-vector selection is an error. JSON reports use `MATCH`, `MISMATCH` or `EXECUTION_ERROR` with separate counters and `notRun`. An execution failure overrides semantic mismatches. Match does not establish correctness outside the selected cases.

Objects use documented expected-field projections, arrays preserve order/length, scalars preserve type/value and required null fields must actually exist. Tagged BigInt records are exact. Response envelopes are closed. See [adapter contract](ADAPTER.md) and [descriptive reference contract](../docs/REFERENCE-CONTRACT.md).

The runner bounds per-request time including blocked input writes (default10seconds), request bytes (8MiB), response bytes (1MiB), and total adapter stderr (64KiB). It rejects duplicate keys/non-finite JSON and kills/reaps its owned process group at close. Diagnostics on stderr are drained and bounded; the public report supplies concise error codes rather than echoing all diagnostics. `--timeout` and `--max-response-bytes` permit bounded overrides. These controls do not sandbox a hostile executable; run only inspected/trusted local adapters. Supported platforms are macOS/Linux, not Windows.

Troubleshooting: ensure `node --version` is24.x and dependencies were installed with the locked command. `ADAPTER_EOF` may indicate an import or startup failure; inspect the adapter locally. `TIMEOUT` is not evidence of a wrong authorization decision. An unexpected semantic difference should retain its report and source version for diagnosis; do not regenerate vectors to hide it.
