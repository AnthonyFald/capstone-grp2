const test=require('node:test'),assert=require('node:assert/strict');
async function request(url,method='GET'){
  const {handleRequest}=await import('../scripts/serve.mjs');let status,headers,body;
  await handleRequest({url,method},{writeHead:(s,h)=>{status=s;headers=h;},end:b=>{body=b;}});
  return {status,headers,text:body?.toString()};
}
test('server serves the real app and required browser files',async()=>{const home=await request('/');assert.equal(home.status,200);assert.match(home.text,/Generate meeting notes/);for(const file of ['styles.css','core.js','app.js','ai-worker.js','data/scenarios.js'])assert.equal((await request('/'+file)).status,200);});
test('server rejects hidden files, encoded traversal, and writes',async()=>{assert.equal((await request('/.env')).status,403);assert.equal((await request('/..%5c..%5csecret')).status,403);assert.equal((await request('/','POST')).status,405);});
test('missing resources fail explicitly and HEAD has no body',async()=>{assert.equal((await request('/missing.txt')).status,404);assert.equal((await request('/','HEAD')).text,undefined);});
