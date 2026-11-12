const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const home=fs.readFileSync(path.join(root,'index.html'),'utf8'),demo=fs.readFileSync(path.join(root,'demo-1/index.html'),'utf8');
const liveWorkspace='https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev/client/';
test('project front page offers one workspace launch and retains research links', () => {
  assert.equal(home.split('href="'+liveWorkspace+'"').length-1, 1);
  assert.doesNotMatch(home, /href="(?:https?:\/\/[^"]+\/)?demo-[123]\/"|>Open Demo [123]/);
  assert.match(home, /href="demo-2\/research\.html"/);
});
test('demo keeps project navigation and marks the current page',()=>{assert.match(demo,/href="\.\/" aria-current="page"/);for(const id of ['overview','case-study','approach','experiments','evaluation','team','resources'])assert.ok(demo.includes('href="../#'+id+'"'));});
test('browser resources resolve under a GitHub Pages project subpath',()=>{for(const [html,dir] of [[home,''],[demo,'demo-1']]){for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){const link=m[1];if(/^(https?:|#)/.test(link))continue;const pathname=link.split(/[?#]/)[0];if(!pathname)continue;const target=path.resolve(root,dir,pathname);assert.ok(target.startsWith(root),link+' escapes project');assert.ok(fs.existsSync(target),link+' is missing');assert.ok(!link.startsWith('/'),link+' incorrectly assumes a domain root');}}});
test('model worker remains relative and uses free local inference',()=>{const app=fs.readFileSync(path.join(root,'demo-1/app.js'),'utf8'),worker=fs.readFileSync(path.join(root,'demo-1/ai-worker.js'),'utf8');const workerPath=app.match(/new Worker\('([^']+)'/)?.[1];assert.ok(workerPath);assert.equal(workerPath.split('?')[0],'ai-worker.js');assert.ok(fs.existsSync(path.join(root,'demo-1',workerPath.split('?')[0])));assert.match(worker,/CreateMLCEngine/);assert.ok(!/api\.openai\.com|OPENAI_API_KEY/.test(app+worker));});
test('local site preview serves nested demo and redirects missing slash',async()=>{const {handleRequest}=await import('../scripts/serve.mjs');for(const [url,expected] of [['/',200],['/demo-1/',200],['/demo-1',301],['/demo-1/ai-worker.js',200],['/.git/config',403]]){let status;await handleRequest({url,method:'GET'},{writeHead:s=>status=s,end:()=>{}});assert.equal(status,expected,url);}});

test('the Evergreen Workspace landing links resolve and its modules are executable in preview', async () => {
  const {handleRequest} = await import('../scripts/serve.mjs');
  const base = '/demo-3/public/client/';
  for (const [url, type] of [[base, 'text/html'], [base + 'client.mjs', 'text/javascript'], [base + 'auth.mjs', 'text/javascript']]) {
    let status, headers;
    await handleRequest({url, method:'GET'}, {
      writeHead(code, values) { status = code; headers = values; },
      end() {}
    });
    assert.equal(status, 200, url);
    assert.ok(headers['Content-Type'].startsWith(type), url);
  }
});

test('workspace presents all three review actions inside the signed-in product', () => {
  const client = fs.readFileSync(path.join(root,'demo-3/public/client/index.html'),'utf8');
  for (const workflow of ['meeting','daily','rfi']) assert.match(client, new RegExp('data-workflow="' + workflow + '"'));
  assert.doesNotMatch(client, /href="[^"]*\/demo-[123]\//);
  const clientScript = fs.readFileSync(path.join(root,'demo-3/public/client/client.mjs'),'utf8');
  assert.ok(clientScript.includes(liveWorkspace));
  assert.match(clientScript, /link\.href = hostedWorkspace \+ link\.getAttribute\('href'\)/);
});
