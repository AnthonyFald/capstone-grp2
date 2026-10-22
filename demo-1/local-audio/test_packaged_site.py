import importlib.util
import unittest
from pathlib import Path


class PackagedSiteTests(unittest.TestCase):
    def test_both_demos_and_public_evidence_are_bundled_without_native_code(self):
        path = Path(__file__).resolve().parents[1] / 'desktop' / 'build.py'
        spec = importlib.util.spec_from_file_location('desktop_build', path)
        build = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(build)
        files = {p.relative_to(build.ROOT).as_posix() for p in build.public_site_files()}
        for required in ['demo-2/index.html', 'demo-2/ai-worker.js', 'demo-2/engine.js',
                         'demo-2/data/reports-a.csv', 'demo-2/docs/scoring.json',
                         'demo-1/model-download.js', 'index.html']:
            self.assertIn(required, files)
        self.assertNotIn('demo-2/native-engine.cjs', files)
        self.assertTrue(all('/tests/' not in p and '/local-audio/' not in p and '.git' not in p for p in files))


if __name__ == '__main__':
    unittest.main()
