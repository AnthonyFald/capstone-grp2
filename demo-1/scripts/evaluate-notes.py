"""Optional real-WebGPU development check; requires Python Playwright and Chrome.

Run from the repository root. This is separate from offline unit tests. Public
models download once into the chosen browser profile; inference stays local.
The report includes original model output and criteria for HUMAN review, not an
accuracy score. No private recordings or transcripts are included in fixtures.
"""
import argparse
import functools
import hashlib
import http.server
import json
from pathlib import Path
import platform
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True, choices=['Qwen3-8B-q4f16_1-MLC', 'Qwen3-8B-q4f32_1-MLC'], help='A model supported by the application template')
    parser.add_argument('--profile', type=Path, default=ROOT / 'desktop-build/note-evaluation/browser')
    parser.add_argument('--output', type=Path, default=ROOT / 'desktop-build/note-evaluation/results.json')
    parser.add_argument('--port', type=int, default=4189)
    parser.add_argument('--fixtures', type=Path, default=ROOT / 'demo-1/tests/fixtures/note-quality.json')
    args = parser.parse_args()
    args.profile.mkdir(parents=True, exist_ok=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    fixtures = json.loads(args.fixtures.read_text())
    report = {'model': args.model, 'platform': platform.platform(), 'webllm': '0.2.85',
              'pipeline_sha256': hashlib.sha256((ROOT / 'demo-1/note-engine.js').read_bytes()).hexdigest(),
              'normalizer_sha256': hashlib.sha256((ROOT / 'demo-1/core.js').read_bytes()).hexdigest(),
              'scope': 'Development examples with model-generated output. Read each review criterion and judge the notes. This is not an independent accuracy benchmark.',
              'cases': [], 'status': 'running'}
    args.output.write_text(json.dumps(report, indent=2)+'\n')
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch_persistent_context(str(args.profile.resolve()), channel='chrome', headless=True)
            try:
                report['browser'] = browser.browser.version if browser.browser else 'Chrome'
                page = browser.pages[0]
                # A plain source page supplies the local secure origin without starting the UI.
                page.goto(f'http://127.0.0.1:{args.port}/demo-1/tests/fixtures/note-quality.json')
                page.expose_function('modelProgress', lambda value: print(value['text'], flush=True))
                page.expose_function('noteProgress', lambda value: print(value, flush=True))
                setup_start = time.monotonic()
                page.evaluate('''async model=>{
                    await import('/demo-1/core.js');
                    window.noteWorker=new Worker('/demo-1/ai-worker.js',{type:'module'});
                    window.askWorker=message=>new Promise((resolve,reject)=>{
                      const timer=setTimeout(()=>{noteWorker.terminate();reject(new Error('Local model timed out after fifteen minutes.'));},15*60*1000);
                      const fail=error=>{clearTimeout(timer);reject(error);};
                      const done=value=>{clearTimeout(timer);resolve(value);};
                      noteWorker.onerror=event=>fail(new Error(event.message));
                      noteWorker.onmessage=({data})=>{
                        if(data.type==='error')fail(new Error(data.message));
                        else if(data.type==='ready')done(data);
                        else if(data.type==='result'){try{done(JSON.parse(data.content));}catch(error){fail(error);}}
                        else if(data.type==='progress'||data.type==='download-status')modelProgress(data);
                        else if(data.type==='generation-progress')noteProgress(data.text);
                      };
                      noteWorker.postMessage(message);
                    });
                    await askWorker({type:'load',model});
                }''', args.model)
                report['model_setup_seconds'] = round(time.monotonic()-setup_start, 2)
                args.output.write_text(json.dumps(report, indent=2)+'\n')
                for case in fixtures:
                    print('Evaluating:', case['id'], flush=True)
                    start = time.monotonic()
                    try:
                        result = page.evaluate('''async fixture=>{
                            const transcript=fixture.transcript.split('\\n').map((line,i)=>'['+(i+1)+'] '+line).join('\\n');
                            const raw=await askWorker({type:'generate',transcript});
                            return MeetingCore.normalizeModelOutput(raw,fixture.transcript);
                        }''', case)
                        result['model'] = args.model
                        report['cases'].append({**case, 'seconds': round(time.monotonic()-start, 2), 'result': result})
                    except Exception as error:
                        report['cases'].append({**case, 'seconds': round(time.monotonic()-start, 2), 'error': str(error)})
                    args.output.write_text(json.dumps(report, indent=2)+'\n')
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        report['status'] = 'complete' if len(report['cases']) == len(fixtures) and not any('error' in case for case in report['cases']) else 'failed'
        args.output.write_text(json.dumps(report, indent=2)+'\n')
    print('Saved original output and review criteria:', args.output)
    if any('error' in case for case in report['cases']):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
