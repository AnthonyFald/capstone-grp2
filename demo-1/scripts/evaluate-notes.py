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
import re
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ['core.js', 'note-engine.js', 'ai-worker.js', 'model-download.js']
ASSET_HASHES = {name: hashlib.sha256((ROOT / 'demo-1' / name).read_bytes()).hexdigest() for name in ASSETS}
PREFIX = '/evaluation-' + hashlib.sha256(json.dumps(ASSET_HASHES, sort_keys=True).encode()).hexdigest()[:16]
PIPELINE = re.search(r"const VERSION='([^']+)'", (ROOT / 'demo-1/note-engine.js').read_text()).group(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True, choices=['Qwen3.5-9B-q4f16_1-MLC', 'Qwen3.5-9B-q4f32_1-MLC'], help='A model supported by the application template')
    parser.add_argument('--profile', type=Path, default=ROOT / 'desktop-build/note-evaluation/browser')
    parser.add_argument('--output', type=Path, default=ROOT / 'desktop-build/note-evaluation/results.json')
    parser.add_argument('--port', type=int, default=4189)
    parser.add_argument('--fixtures', type=Path, default=ROOT / 'demo-1/tests/fixtures/note-quality-v3.json')
    parser.add_argument('--temperature', type=float, default=0.1, choices=[0.1, 0.3, 0.7])
    args = parser.parse_args()
    args.profile.mkdir(parents=True, exist_ok=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path.startswith(PREFIX + '/'):
                self.path = self.path[len(PREFIX):]
            if 'If-Modified-Since' in self.headers:
                del self.headers['If-Modified-Since']
            return super().do_GET()

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def log_message(self, *_):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    fixtures = json.loads(args.fixtures.read_text())
    report = {'model': args.model, 'platform': platform.platform(), 'webllm': '0.2.85', 'temperature': args.temperature, 'temperature_scope': 'Section extraction without free-form reasoning',
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
                page.goto(f'http://127.0.0.1:{args.port}{PREFIX}/demo-1/tests/fixtures/note-quality.json')
                page.expose_function('modelProgress', lambda value: print(value['text'], flush=True))
                page.expose_function('noteProgress', lambda value: print(value, flush=True))
                setup_start = time.monotonic()
                page.evaluate('''async ({model,prefix})=>{
                    await import(prefix+'/demo-1/core.js');
                    window.noteWorker=new Worker(prefix+'/demo-1/ai-worker.js',{type:'module'});
                    window.askWorker=message=>new Promise((resolve,reject)=>{
                      window.lastTrace=[];
                      const timer=message.type==='load'?setTimeout(()=>{noteWorker.terminate();reject(new Error('Local model loading timed out.'));},15*60*1000):null;
                      const fail=error=>{clearTimeout(timer);reject(error);};
                      const done=value=>{clearTimeout(timer);resolve(value);};
                      noteWorker.onerror=event=>fail(new Error(event.message));
                      noteWorker.onmessage=({data})=>{
                        if(data.type==='debug')lastTrace.push({phase:data.phase,value:data.value});
                        else if(data.type==='error')fail(new Error(data.message));
                        else if(data.type==='ready')done(data);
                        else if(data.type==='result'){try{done(JSON.parse(data.content));}catch(error){fail(error);}}
                        else if(data.type==='progress'||data.type==='download-status')modelProgress(data);
                        else if(data.type==='generation-progress')noteProgress(data.text);
                      };
                      noteWorker.postMessage(message);
                    });
                    await askWorker({type:'load',model});
                }''', {'model':args.model,'prefix':PREFIX})
                report['model_setup_seconds'] = round(time.monotonic()-setup_start, 2)
                served = page.evaluate('''async ({prefix,files})=>{
                    const hashes={};
                    for(const name of files){
                        const response=await fetch(prefix+'/demo-1/'+name,{cache:'no-store'});
                        const digest=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
                        hashes[name]=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
                    }
                    return hashes;
                }''', {'prefix':PREFIX,'files':ASSETS})
                if served != ASSET_HASHES:
                    raise RuntimeError('Browser-served source does not match the evaluated pipeline.')
                report['browser_served_sha256'] = served
                report['version_url_prefix'] = PREFIX
                args.output.write_text(json.dumps(report, indent=2)+'\n')
                for case in fixtures:
                    print('Evaluating:', case['id'], flush=True)
                    start = time.monotonic()
                    try:
                        result = page.evaluate('''async ({fixture,temperature})=>{
                            const transcript=fixture.transcript.split('\\n').map((line,i)=>'['+(i+1)+'] '+line).join('\\n');
                            const raw=await askWorker({type:'generate',transcript,temperature,debug:true});
                            return MeetingCore.normalizeModelOutput(raw,fixture.transcript);
                        }''', {'fixture': case, 'temperature': args.temperature})
                        if result.get('pipeline') != PIPELINE:
                            raise RuntimeError('A different cached pipeline executed.')
                        result['model'] = args.model
                        report['cases'].append({**case, 'seconds': round(time.monotonic()-start, 2), 'result': result, 'trace': page.evaluate('window.lastTrace')})
                    except Exception as error:
                        report['cases'].append({**case, 'seconds': round(time.monotonic()-start, 2), 'error': str(error), 'trace': page.evaluate('window.lastTrace')})
                        # A timed-out worker may have been terminated. Do not
                        # make subsequent cases wait on a dead worker.
                        args.output.write_text(json.dumps(report, indent=2)+'\n')
                        break
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
