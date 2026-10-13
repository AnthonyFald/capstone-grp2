import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import runtime_paths


class RuntimePathTests(unittest.TestCase):
    def test_bundle_resources_and_writable_models_are_separate(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(sys, 'frozen', True, create=True), patch.object(sys, '_MEIPASS', directory, create=True):
                with patch.dict(os.environ, {'EVERGREEN_DEMO_DATA_DIR': str(Path(directory) / 'user-data')}):
                    self.assertEqual(runtime_paths.resource_root(), Path(directory) / 'site')
                    self.assertEqual(runtime_paths.data_root(), (Path(directory) / 'user-data').resolve())

    def test_windows_storage_does_not_use_the_readonly_app_folder(self):
        with patch.object(sys, 'frozen', True, create=True), patch.object(sys, 'platform', 'win32'):
            with patch.dict(os.environ, {'LOCALAPPDATA': str(Path.cwd() / 'test-user')}, clear=True):
                self.assertEqual(runtime_paths.data_root(), Path.cwd() / 'test-user/Evergreen Meeting Demo')

    def test_mac_storage_is_under_user_application_support(self):
        with patch.object(sys, 'frozen', True, create=True), patch.object(sys, 'platform', 'darwin'), patch.dict(os.environ, {}, clear=True):
            with patch.object(Path, 'home', return_value=Path('/test-user')):
                self.assertEqual(runtime_paths.data_root(), Path('/test-user/Library/Application Support/Evergreen Meeting Demo'))
