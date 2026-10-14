"""Double-click desktop companion. Python and audio libraries are bundled."""
import argparse
import json
import os
import platform
import subprocess
import sys
import threading
import time
import traceback
import urllib.request
import webbrowser
from pathlib import Path

from runtime_paths import data_root, resource_root

APP_NAME = 'Evergreen Meeting Demo'


def start_service():
    import server
    # Keep a predictable browser origin for model reuse. Never stop another service.
    last_error = None
    for port in range(4176, 4186):
        try:
            service = server.create_server(port)
            threading.Thread(target=service.serve_forever, daemon=True).start()
            return service, f'http://127.0.0.1:{port}/demo-1/'
        except OSError as error:
            last_error = error
    raise RuntimeError('Could not open a local connection. Close an older demo app and try again.') from last_error


def open_demo(url):
    """Only the Open demo button calls this; respect the default browser."""
    if not webbrowser.open(url):
        raise RuntimeError('The default browser could not be opened.')


def run_window():
    import tkinter as tk
    from tkinter import messagebox, ttk
    import server

    window = tk.Tk()
    window.title(APP_NAME)
    window.geometry('540x345')
    window.minsize(500, 320)
    frame = ttk.Frame(window, padding=24)
    frame.pack(fill='both', expand=True)
    ttk.Label(frame, text='Meeting notes, on your computer.', font=('', 18, 'bold')).pack(anchor='w')
    ttk.Label(frame, text='No terminal. No Python setup. No paid AI account.', wraplength=480).pack(anchor='w', pady=(10, 18))
    status = tk.StringVar(value='Starting the local audio companion…')
    ttk.Label(frame, textvariable=status, wraplength=480).pack(anchor='w', pady=(0, 12))
    progress = ttk.Progressbar(frame, mode='indeterminate')
    progress.pack(fill='x')
    progress.start()
    detail = tk.StringVar(value='First use downloads free models. Your recording stays on this computer.')
    ttk.Label(frame, textvariable=detail, wraplength=480).pack(anchor='w', pady=14)
    buttons = ttk.Frame(frame)
    buttons.pack(fill='x', pady=8)
    service = None
    url = None

    def show_log():
        path = data_root() / 'launcher.log'
        if sys.platform == 'win32':
            os.startfile(path)
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', '-t', str(path)])

    def launch_browser():
        try:
            open_demo(url)
        except Exception:
            traceback.print_exc()
            messagebox.showinfo(APP_NAME, 'Open this address in your browser:\n\n' + url, parent=window)

    open_button = ttk.Button(buttons, text='Open demo', command=launch_browser, state='disabled')
    open_button.pack(side='left')
    ttk.Button(buttons, text='Show support log', command=show_log).pack(side='left', padx=8)

    def quit_app():
        with server.LOCK:
            state = server.STATE['state']
        if state in ('running', 'done') and not messagebox.askokcancel(
            'Close the companion?',
            'Closing stops audio processing and clears the transcript held by the companion. Export your transcript and notes in the browser first.',
            parent=window):
            return
        if service:
            service.shutdown()
            service.server_close()
        window.destroy()

    ttk.Button(buttons, text='Quit', command=quit_app).pack(side='right')
    ttk.Label(frame, text='Keep this small window open while using the demo.\nUse Chrome or Edge for AI meeting notes.', wraplength=480).pack(anchor='w', pady=(8, 0))
    window.protocol('WM_DELETE_WINDOW', quit_app)

    def refresh():
        with server.LOCK:
            snapshot = dict(server.STATE)
            timing = server.TRACKER.snapshot() if server.TRACKER and snapshot['state'] == 'running' else None
        ready = 'Demo 1 connected. Choose a recording in your open browser tab.' if server.browser_connected() else 'Ready. Return to your Demo 1 tab, or click Open demo.'
        status.set(snapshot['message'] if snapshot['state'] != 'idle' else ready)
        if timing:
            percent = timing.get('percent')
            if percent is None:
                progress.configure(mode='indeterminate')
                progress.start()
            else:
                progress.stop()
                progress.configure(mode='determinate', value=percent)
            seconds = timing.get('etaSeconds')
            if seconds:
                prefix = 'This model download' if timing['etaScope'] == 'download' else 'Estimated processing time left'
                detail.set(f'{prefix}: {seconds // 60:02d}:{seconds % 60:02d}. The estimate adjusts as processing advances.')
            else:
                detail.set('Still working. Estimating time remaining…')
        else:
            progress.stop()
            progress.configure(mode='determinate', value=100 if snapshot['state'] == 'done' else 0)
            detail.set('Recordings stay on this computer. Export your transcript and notes before quitting.')
        window.after(1000, refresh)

    def begin():
        nonlocal service, url
        try:
            service, url = start_service()
            open_button.configure(state='normal')
            refresh()
        except Exception as error:
            traceback.print_exc()
            progress.stop()
            status.set('The companion could not start.')
            detail.set(str(error) + ' Use Show support log for details.')

    window.after(150, begin)
    window.mainloop()


def self_test(report, audio=False):
    """Exercise the actual bundled runtime on each target OS before releasing."""
    import tkinter as tk
    import av
    import ctranslate2
    import faster_whisper
    import numpy
    import onnxruntime
    import sherpa_onnx
    import tokenizers
    import server

    window = tk.Tk()
    window.withdraw()
    window.update()
    window.destroy()
    service = server.create_server(0)
    threading.Thread(target=service.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{service.server_port}'
    result = {'success': False, 'platform': platform.platform(), 'architecture': platform.machine(), 'frozen': bool(getattr(sys, 'frozen', False))}
    try:
        for path in ['/demo-1/', '/demo-1/app.js', '/demo-1/model-download.js', '/demo-1/audio-connection.js', '/demo-1/audio.js']:
            with urllib.request.urlopen(base + path, timeout=10) as response:
                assert response.status == 200 and len(response.read()) > 50, path
        config = json.load(urllib.request.urlopen(base + '/api/audio/config'))
        assert config['localAudio']
        result['gui_runtime_and_local_server'] = True
        if audio:
            # Do not let the build machine's CA install hide a broken bundle.
            # Exercise the actual downloader with empty OpenSSL default paths.
            from processor import download, RELEASE, SEGMENTATION
            probe = data_root() / 'certificate-probe.tar.bz2'
            empty_defaults = {'SSL_CERT_FILE': os.devnull, 'SSL_CERT_DIR': str(data_root() / 'missing-certs')}
            original_defaults = {name: os.environ.get(name) for name in empty_defaults}
            try:
                probe.unlink(missing_ok=True)
                os.environ.update(empty_defaults)
                download(RELEASE + 'speaker-segmentation-models/' + SEGMENTATION + '.tar.bz2', probe, lambda *a, **k: None)
                assert probe.stat().st_size > 1000
                result['bundled_certificates_https'] = True
            finally:
                for name, value in original_defaults.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value
                probe.unlink(missing_ok=True)
            fixture = resource_root() / 'demo-1/data/synthetic-introduction.wav'
            request = urllib.request.Request(base + '/api/audio/jobs', data=fixture.read_bytes(), headers={
                'X-Local-Token': config['token'], 'X-Speaker-Count': '1', 'X-Whisper-Model': 'base.en', 'Content-Type': 'application/octet-stream'})
            assert urllib.request.urlopen(request).status == 202
            deadline = time.monotonic() + 600
            while time.monotonic() < deadline:
                request = urllib.request.Request(base + '/api/audio/status', headers={'X-Local-Token': config['token']})
                state = json.load(urllib.request.urlopen(request, timeout=30))
                if state['state'] != 'running':
                    assert state['state'] == 'done', state['message']
                    transcript = state['result']
                    assert len(transcript['segments']) >= 4
                    assert 'corridor' in ' '.join(s['text'] for s in transcript['segments']).lower()
                    result['audio_seconds'] = transcript['duration']
                    result['processing_seconds'] = transcript['elapsedSeconds']
                    result['transcription_and_diarization'] = True
                    break
                time.sleep(.5)
            else:
                raise TimeoutError('Packaged audio test did not finish.')
        result['success'] = True
    finally:
        service.shutdown()
        service.server_close()
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(result, indent=2), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', type=Path, metavar='REPORT')
    parser.add_argument('--audio-test', action='store_true')
    args = parser.parse_args()
    folder = data_root()
    folder.mkdir(parents=True, exist_ok=True)
    log_path = folder / 'launcher.log'
    if log_path.exists() and log_path.stat().st_size > 2_000_000:
        log_path.replace(folder / 'launcher-previous.log')
    # Windowed executables have no stdout/stderr. Libraries still need writable streams.
    previous_stdout, previous_stderr = sys.stdout, sys.stderr
    with log_path.open('a', encoding='utf-8', buffering=1) as log:
        sys.stdout = sys.stderr = log
        try:
            if args.self_test:
                self_test(args.self_test, audio=args.audio_test)
            else:
                run_window()
        except Exception:
            traceback.print_exc()
            if not args.self_test:
                try:
                    import tkinter as tk
                    from tkinter import messagebox
                    window = tk.Tk()
                    window.withdraw()
                    messagebox.showerror(APP_NAME, 'Could not start the companion. Details were saved to:\n' + str(log_path))
                    window.destroy()
                except Exception:
                    pass
            return 1
        finally:
            sys.stdout, sys.stderr = previous_stdout, previous_stderr
    return 0


if __name__ == '__main__':
    sys.exit(main())
