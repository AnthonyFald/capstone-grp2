import functools
import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from server import Handler, ROOT


class LocalServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, path, headers=None, data=None):
        try:
            response = urllib.request.urlopen(urllib.request.Request(self.base + path, headers=headers or {}, data=data))
        except urllib.error.HTTPError as error:
            response = error
        return response.status, response.read()

    def test_static_ui_and_config(self):
        self.assertEqual(self.request('/demo-1/')[0], 200)
        code, raw = self.request('/api/audio/config')
        self.assertEqual(code, 200)
        self.assertTrue(json.loads(raw)['localAudio'])

    def test_private_paths_and_foreign_origins_are_blocked(self):
        self.assertEqual(self.request('/demo-1/local-audio/requirements.txt')[0], 404)
        self.assertEqual(self.request('/.git/config')[0], 404)
        self.assertEqual(self.request('/api/audio/config', {'Origin': 'https://example.com'})[0], 403)
        self.assertEqual(self.request('/api/audio/config', {'Host': 'example.com'})[0], 403)

    def test_upload_needs_local_token_and_nonempty_audio(self):
        self.assertEqual(self.request('/api/audio/jobs', data=b'test')[0], 403)
        token = json.loads(self.request('/api/audio/config')[1])['token']
        self.assertEqual(self.request('/api/audio/jobs', {'X-Local-Token': token}, data=b'')[0], 400)


if __name__ == '__main__':
    unittest.main()
