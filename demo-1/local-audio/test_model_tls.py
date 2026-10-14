import io
import os
import ssl
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from model_tls import download_context
from processor import download


class ModelTLSTests(unittest.TestCase):
    def test_empty_system_trust_store_still_loads_bundled_roots(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(os.environ, {'SSL_CERT_FILE': os.devnull, 'SSL_CERT_DIR': folder}):
                context = download_context()
            self.assertGreater(len(context.get_ca_certs()), 50)
            self.assertTrue(context.check_hostname)
            self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)

    def test_downloader_passes_verified_context_and_finishes_atomically(self):
        response = io.BytesIO(b'model contents')
        response.headers = {'Content-Length': '14'}
        with tempfile.TemporaryDirectory() as folder, patch('processor.urllib.request.urlopen', return_value=response) as open_url:
            target = Path(folder) / 'model.onnx'
            download('https://example.com/model', target, lambda *a, **k: None)
            self.assertEqual(target.read_bytes(), b'model contents')
            self.assertFalse(target.with_suffix('.onnx.part').exists())
            context = open_url.call_args.kwargs['context']
            self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
            self.assertTrue(context.check_hostname)

    def test_certificate_failure_is_not_bypassed_or_cached(self):
        with tempfile.TemporaryDirectory() as folder, patch('processor.urllib.request.urlopen', side_effect=ssl.SSLCertVerificationError('untrusted')) as open_url:
            target = Path(folder) / 'model.onnx'
            with self.assertRaises(ssl.SSLCertVerificationError):
                download('https://example.com/model', target, lambda *a, **k: None)
            self.assertEqual(open_url.call_count, 1)
            self.assertFalse(target.exists())
            self.assertFalse(target.with_suffix('.onnx.part').exists())
