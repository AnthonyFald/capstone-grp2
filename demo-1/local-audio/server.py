"""Local-only companion. Serves the demo and processes audio on the CPU."""
import argparse
import functools
import json
import secrets
import tempfile
import threading
import time
import traceback
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from processor import process
from progress import AudioProgress
from runtime_paths import resource_root, data_root

ROOT = resource_root()
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
STATE = dict(state='idle', message='Ready for a recording.')
TRACKER = None
TIMING_RATES = {}
MAX_BYTES = 80 * 1024 * 1024
HOSTED_ORIGIN = 'https://anthonyfald.github.io'
HOSTED_PATH = '/capstone-grp2/demo-1/'
API_PATHS = {'/api/audio/config', '/api/audio/status', '/api/audio/heartbeat', '/api/audio/jobs'}
LAST_BROWSER_SEEN = None


def browser_connected():
    with LOCK:
        return LAST_BROWSER_SEEN is not None and time.monotonic() - LAST_BROWSER_SEEN < 90


def update(**values):
    with LOCK:
        STATE.update(values)


def run_audio(path, count, model):
    def report(message, **details):
        with LOCK:
            TRACKER.update(message, **details)
            STATE['message'] = message
    try:
        result = process(path, count, report, model_size=model)
        with LOCK:
            result['elapsedSeconds'] = round(time.monotonic() - TRACKER.started, 2)
            TIMING_RATES.update(TRACKER.learned)
        update(state='done', message='Transcript ready. Review the speakers and wording.', result=result)
    except Exception as error:
        traceback.print_exc()
        update(state='error', message=str(error))
    finally:
        path.unlink(missing_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def allowed(self):
        expected = '127.0.0.1:' + str(self.server.server_port)
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        return host == expected and (not origin or origin == 'http://' + expected or (
            origin == HOSTED_ORIGIN and urlsplit(self.path).path in API_PATHS))

    def end_headers(self):
        origin = self.headers.get('Origin')
        if self.allowed() and origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        super().end_headers()

    def do_OPTIONS(self):
        if not self.allowed() or urlsplit(self.path).path not in API_PATHS:
            return self.reply(403, dict(error='This website cannot connect to the companion.'))
        requested = {h.strip().lower() for h in self.headers.get('Access-Control-Request-Headers', '').split(',') if h.strip()}
        allowed = {'content-type', 'x-local-token', 'x-speaker-count', 'x-whisper-model', 'x-demo-page'}
        if self.headers.get('Access-Control-Request-Method') not in ('GET', 'POST') or not requested <= allowed:
            return self.reply(403, dict(error='Unsupported request.'))
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST')
        self.send_header('Access-Control-Allow-Headers', ', '.join(sorted(allowed)))
        # Older browsers use Private Network Access preflights.
        if self.headers.get('Access-Control-Request-Private-Network') == 'true':
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def reply(self, code, data):
        raw = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if not self.allowed():
            return self.reply(403, dict(error='Open the local app at its printed 127.0.0.1 address.'))
        path = urlsplit(self.path).path
        if path == '/api/audio/config':
            return self.reply(200, dict(localAudio=True, app='evergreen-meeting-demo', protocol=1, token=TOKEN))
        if path == '/api/audio/status':
            if self.headers.get('X-Local-Token') != TOKEN:
                return self.reply(403, dict(error='Reconnect to the companion before trying again.'))
            with LOCK:
                snapshot = dict(STATE)
                if TRACKER and STATE['state'] == 'running':
                    snapshot['progress'] = TRACKER.snapshot()
            return self.reply(200, snapshot)
        return super().do_GET()

    def send_head(self):
        # Never expose model caches, Python files, dotfiles, uploads or arbitrary folders.
        if not self.allowed():
            self.send_error(403)
            return None
        path = Path(unquote(urlsplit(self.path).path).lstrip('/'))
        if any(part.startswith('.') or part in ('local-audio', '__pycache__') for part in path.parts):
            self.send_error(404)
            return None
        resolved = (ROOT / path).resolve()
        if not resolved.is_relative_to(ROOT) or (resolved.is_file() and resolved.suffix not in ('.html', '.css', '.js', '.json', '.md', '.txt', '.png', '.svg', '.ico', '.docx', '.pptx')):
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def do_POST(self):
        global TRACKER, LAST_BROWSER_SEEN
        if not self.allowed() or self.headers.get('X-Local-Token') != TOKEN:
            return self.reply(403, dict(error='Refresh the local app before trying again.'))
        if self.path == '/api/audio/heartbeat':
            page = urlsplit(self.headers.get('X-Demo-Page', ''))
            local_origin = f'http://127.0.0.1:{self.server.server_port}'
            page_origin = f'{page.scheme}://{page.netloc}'
            expected_path = HOSTED_PATH if page_origin == HOSTED_ORIGIN else '/demo-1/'
            origin = self.headers.get('Origin')
            if page_origin not in (HOSTED_ORIGIN, local_origin) or (origin and origin != page_origin) or page.path not in (expected_path, expected_path + 'index.html'):
                return self.reply(400, dict(error='Connect from the Demo 1 page.'))
            with LOCK:
                LAST_BROWSER_SEEN = time.monotonic()
            return self.reply(200, dict(connected=True))
        if self.path != '/api/audio/jobs':
            return self.reply(404, dict(error='Not found.'))
        try:
            size = int(self.headers.get('Content-Length', '0'))
            count = int(self.headers.get('X-Speaker-Count', '0'))
            model = self.headers.get('X-Whisper-Model', 'base.en')
            if not 0 < size <= MAX_BYTES or not 0 <= count <= 12 or model not in ('base.en', 'small.en'):
                raise ValueError('Use an audio file under 80 MB and 0–12 speakers.')
        except ValueError as error:
            return self.reply(400, dict(error=str(error)))
        with LOCK:
            if STATE['state'] == 'running':
                return self.reply(409, dict(error='A recording is already processing.'))
            STATE.clear()
            TRACKER = AudioProgress(model=model, rates=TIMING_RATES)
            STATE.update(state='running', message='Reading audio…')
        temp = data_root() / '.audio-temp'
        path = None
        try:
            temp.mkdir(parents=True, exist_ok=True)
            self.connection.settimeout(60)
            with tempfile.NamedTemporaryFile(dir=temp, suffix='.audio', delete=False) as out:
                path = Path(out.name)
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError('The audio transfer was interrupted.')
                    out.write(chunk)
                    remaining -= len(chunk)
            threading.Thread(target=run_audio, args=(path, count, model), daemon=True).start()
            return self.reply(202, dict(state='running'))
        except Exception as error:
            if path:
                path.unlink(missing_ok=True)
            update(state='error', message=str(error))
            return self.reply(400, dict(error=str(error)))


def create_server(port=4176):
    return ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=str(ROOT)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4176)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    server = create_server(args.port)
    url = f'http://127.0.0.1:{server.server_port}/demo-1/'
    print(f'Demo 1 with local audio: {url}', flush=True)
    print('Audio stays on this computer. First use downloads free models. Ctrl+C to stop.', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
