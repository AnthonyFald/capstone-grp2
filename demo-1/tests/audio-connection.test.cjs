const test=require('node:test'),assert=require('node:assert/strict');
const {create,candidates}=require('../audio-connection.js');
const hosted=new URL('https://anthonyfald.github.io/capstone-grp2/demo-1/');
const info=(token='a'.repeat(43))=>({app:'evergreen-meeting-demo',protocol:1,localAudio:true,token});
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});

test('discovery is limited to the actual Demo 1 page and loopback ports',()=>{
  assert.equal(candidates(hosted).length,10);
  assert.deepEqual(candidates(new URL('https://example.com/demo-1/')),[]);
  assert.deepEqual(candidates(new URL('https://anthonyfald.github.io/other/')),[]);
  assert.deepEqual(candidates(new URL('http://127.0.0.1:4182/demo-1/')),['http://127.0.0.1:4182']);
});

test('already-open hosted tab discovers a later app, alternate port, and sends audio only locally',async()=>{
  let started=false;const calls=[];
  const client=create({location:hosted,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(!started||!url.startsWith('http://127.0.0.1:4178/'))throw new TypeError('Failed to fetch');
    if(url.endsWith('/config'))return reply(info());
    return reply({connected:true},url.endsWith('/jobs')?202:200);
  }});
  await assert.rejects(client.connect(),/Open the companion/);
  started=true;assert.equal(await client.connect(),true);assert.equal(client.connected,true);
  const heartbeat=calls.find(c=>c.url.endsWith('/heartbeat'));
  assert.equal(heartbeat.options.headers['X-Demo-Page'],hosted.href);
  assert.equal(heartbeat.options.headers['X-Local-Token'],info().token);
  const file=new Blob(['recording']);
  assert.equal((await client.request('/api/audio/jobs',{method:'POST',body:file})).status,202);
  assert.equal(calls.at(-1).options.body,file);
  assert.ok(calls.every(c=>c.url.startsWith('http://127.0.0.1:')));
  const count=calls.filter(c=>c.url.endsWith('/config')).length;
  assert.equal(await client.connect(),false);
  assert.equal(calls.filter(c=>c.url.endsWith('/config')).length,count);
});

test('app restart replaces its session token and recovers without reloading the page',async()=>{
  let token='a'.repeat(43);const used=[];
  const client=create({location:new URL('http://127.0.0.1:4176/demo-1/'),fetchImpl:async(url,options)=>{
    if(url.endsWith('/config'))return reply(info(token));
    used.push(options.headers['X-Local-Token']);
    return reply({},used.at(-1)===token?200:403);
  }});
  await client.connect();token='b'.repeat(43);
  await assert.rejects(client.request('/api/audio/status'),/restarted/);
  assert.equal(client.connected,false);
  assert.equal(await client.connect(),true);assert.equal(used.at(-1),token);
});

test('unrelated service, denied permission and hung requests never count as a connected demo',async()=>{
  const unrelated=create({location:hosted,fetchImpl:async()=>reply({localAudio:true,token:'a'.repeat(43)})});
  await assert.rejects(unrelated.connect());assert.equal(unrelated.connected,false);
  const blocked=create({location:hosted,fetchImpl:async()=>{throw new TypeError('Permission denied');}});
  await assert.rejects(blocked.connect(),/local network/);assert.equal(blocked.connected,false);
  const hung=create({location:hosted,timeoutMs:5,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout'))))});
  await assert.rejects(hung.connect());assert.equal(hung.connected,false);
});
