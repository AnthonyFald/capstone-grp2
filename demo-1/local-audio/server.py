"""Local-only companion. Serves the demo and processes audio on the CPU."""
import argparse
import functools
import json
import secrets
import tempfile
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from processor import process

ROOT = Path(__file__).resolve().parents[2]
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
STATE = dict(state='idle', message='Ready for a recording.')
MAX_BYTES = 80 * 1024 * 1024


def update(**values):
    with LOCK:
        STATE.update(values)


def run_audio(path, count, model):
    try:
        result = process(path, count, lambda message: update(message=message), model_size=model)
        update(state='done', message='Transcript ready. Review the speakers and wording.', result=result)
    except Exception as error:
        update(state='error', message=str(error))
    finally:
        path.unlink(missing_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def allowed(self):
        expected = '127.0.0.1:' + str(self.server.server_port)
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        return host == expected and (not origin or origin == 'http://' + expected)

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
            return self.reply(200, dict(localAudio=True, token=TOKEN))
        if path == '/api/audio/status':
            with LOCK:
                snapshot = dict(STATE)
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
        if not self.allowed() or self.headers.get('X-Local-Token') != TOKEN:
            return self.reply(403, dict(error='Refresh the local app before trying again.'))
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
            STATE.update(state='running', message='Reading audio…')
        temp = ROOT / 'demo-1' / 'local-audio' / '.audio-temp'
        temp.mkdir(exist_ok=True)
        path = None
        try:
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


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4176)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), functools.partial(Handler, directory=str(ROOT)))
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
