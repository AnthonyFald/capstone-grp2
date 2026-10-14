import functools
import json
import threading
import unittest
import tempfile
import time
from pathlib import Path
from unittest.mock import patch
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from server import Handler, ROOT
import server


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

    def exchange(self, path, method='GET', headers=None, data=None):
        request = urllib.request.Request(self.base + path, method=method, headers=headers or {}, data=data)
        try:
            response = urllib.request.urlopen(request)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def test_only_published_origin_gets_cors_and_api_access(self):
        origin = server.HOSTED_ORIGIN
        code, headers, raw = self.exchange('/api/audio/config', headers={'Origin': origin})
        self.assertEqual(code, 200)
        self.assertEqual(headers['Access-Control-Allow-Origin'], origin)
        self.assertEqual(json.loads(raw)['app'], 'evergreen-meeting-demo')
        for foreign in ['https://example.com', origin + '.evil.test', 'http://anthonyfald.github.io', 'null']:
            code, headers, raw = self.exchange('/api/audio/config', headers={'Origin': foreign})
            self.assertEqual(code, 403)
            self.assertIsNone(headers['Access-Control-Allow-Origin'])
            self.assertNotIn(server.TOKEN.encode(), raw)
        self.assertEqual(self.request('/demo-1/', {'Origin': origin})[0], 403)

    def test_preflight_is_restricted_and_supports_private_network_access(self):
        headers = {'Origin': server.HOSTED_ORIGIN, 'Access-Control-Request-Method': 'POST',
                   'Access-Control-Request-Headers': 'content-type,x-local-token,x-speaker-count,x-whisper-model',
                   'Access-Control-Request-Private-Network': 'true'}
        code, result, _ = self.exchange('/api/audio/jobs', 'OPTIONS', headers)
        self.assertEqual(code, 204)
        self.assertEqual(result['Access-Control-Allow-Origin'], server.HOSTED_ORIGIN)
        self.assertEqual(result['Access-Control-Allow-Private-Network'], 'true')
        for change in [{'Origin': 'https://example.com'}, {'Host': 'evil.test'}, {'Access-Control-Request-Method': 'DELETE'}, {'Access-Control-Request-Headers': 'x-unrelated'}]:
            self.assertEqual(self.exchange('/api/audio/jobs', 'OPTIONS', dict(headers, **change))[0], 403)

    def test_status_requires_token_and_heartbeat_identifies_demo_page(self):
        headers = {'Origin': server.HOSTED_ORIGIN, 'X-Local-Token': server.TOKEN,
                   'X-Demo-Page': server.HOSTED_ORIGIN + server.HOSTED_PATH}
        self.assertEqual(self.request('/api/audio/status', {'Origin': server.HOSTED_ORIGIN})[0], 403)
        self.assertEqual(self.request('/api/audio/status', headers)[0], 200)
        with patch.object(server, 'LAST_BROWSER_SEEN', None):
            self.assertFalse(server.browser_connected())
            self.assertEqual(self.request('/api/audio/heartbeat', headers, b'')[0], 200)
            self.assertTrue(server.browser_connected())
            with patch.object(server.time, 'monotonic', return_value=server.LAST_BROWSER_SEEN + 91):
                self.assertFalse(server.browser_connected())
        self.assertEqual(self.request('/api/audio/heartbeat', dict(headers, **{'X-Demo-Page': server.HOSTED_ORIGIN + '/other/'}), b'')[0], 400)
        self.assertEqual(self.request('/api/audio/heartbeat', dict(headers, **{'X-Local-Token': 'old-session'}), b'')[0], 403)

    def test_hosted_upload_and_authenticated_result_use_local_processing(self):
        result = {'format': 'team2-audio-v1', 'segments': [], 'speakers': []}
        headers = {'Origin': server.HOSTED_ORIGIN, 'X-Local-Token': server.TOKEN,
                   'X-Speaker-Count': '2', 'X-Whisper-Model': 'small.en', 'Content-Type': 'application/octet-stream'}
        received = []
        def process(path, count, report, model_size):
            received.append((path.read_bytes(), count, model_size))
            return dict(result)
        with tempfile.TemporaryDirectory() as folder, patch.object(server, 'data_root', return_value=Path(folder)), patch.object(server, 'process', side_effect=process):
            code, response_headers, _ = self.exchange('/api/audio/jobs', 'POST', headers, b'synthetic audio')
            self.assertEqual(code, 202)
            self.assertEqual(response_headers['Access-Control-Allow-Origin'], server.HOSTED_ORIGIN)
            for _ in range(100):
                state = json.loads(self.request('/api/audio/status', headers)[1])
                if state['state'] != 'running' and not list(Path(folder).rglob('*.audio')):
                    break
                time.sleep(.01)
            self.assertEqual(state['state'], 'done')
            self.assertEqual(received, [(b'synthetic audio', 2, 'small.en')])
            self.assertFalse(list(Path(folder).rglob('*.audio')))


if __name__ == '__main__':
    unittest.main()
