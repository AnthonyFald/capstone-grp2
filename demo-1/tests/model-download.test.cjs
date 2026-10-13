const test=require('node:test'),assert=require('node:assert/strict'),download=require('../model-download.js');
test('interrupted model downloads retry and retain successful responses',async()=>{
  let calls=0;const messages=[];
  const fetch=download.resilientFetch(async()=>{calls++;if(calls===1)throw new TypeError('Failed to fetch');if(calls===2)return new Response('',{status:503});return new Response('model');},{sleep:async()=>{},notify:s=>messages.push(s)});
  assert.equal(await (await fetch('https://example.com/model')).text(),'model');assert.equal(calls,3);assert.equal(messages.length,2);
});
test('unavailable model files and user cancellation do not loop',async()=>{
  let calls=0;const fetch=download.resilientFetch(async()=>{calls++;return new Response('',{status:404});},{sleep:async()=>{}});
  await assert.rejects(fetch('https://example.com/model'),/HTTP 404/);assert.equal(calls,1);
  const abort=new AbortController();abort.abort();await assert.rejects(fetch('https://example.com/model',{signal:abort.signal}));assert.equal(calls,1);
});
test('retries stop after the bounded limit and storage failures get useful guidance',async()=>{
  let calls=0;const fetch=download.resilientFetch(async()=>{calls++;throw new TypeError('Failed to fetch');},{sleep:async()=>{}});
  await assert.rejects(fetch('https://example.com/model'));assert.equal(calls,3);
  assert.equal(download.retryable('QuotaExceededError'),false);assert.match(download.explain('QuotaExceededError'),/disk space/);
  assert.match(download.explain("Failed to execute 'add' on 'Cache': Request failed"),/transcript is still here/);
});
