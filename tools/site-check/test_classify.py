import unittest
from classify import classify
class Selection(unittest.TestCase):
    def test_navigation(self):self.assertEqual(classify(['website/index.html','website/app.js','PACKAGE-FILES.json']),'site')
    def test_browser_code(self):self.assertEqual(classify(['website/playground/worker.js']),'playground')
    def test_engine_fixture(self):self.assertEqual(classify(['website/playground/engine/core.js','website/playground/fixtures/case.json']),'playground')
    def test_mixed_runtime(self):self.assertEqual(classify(['website/index.html','packages/core/src/index.mjs']),'full')
    def test_workflows(self):self.assertEqual(classify(['.github/workflows/ci.yml']),'full')
    def test_classifier(self):self.assertEqual(classify(['tools/site-check/classify.py']),'full')
    def test_unknown(self):self.assertEqual(classify(['new-component/file.md']),'full')
    def test_manifest_only(self):self.assertEqual(classify(['PACKAGE-FILES.json']),'full')
    def test_empty(self):self.assertEqual(classify([]),'full')
    def test_manual(self):self.assertEqual(classify(['website/index.html'],True),'full')
    def test_rename_outside_allowlist(self):self.assertEqual(classify(['website/index.html','somewhere/index.html']),'full')
    def test_historical_source(self):self.assertEqual(classify(['website/source/portable-authority.ts']),'full')
if __name__=='__main__':unittest.main()
