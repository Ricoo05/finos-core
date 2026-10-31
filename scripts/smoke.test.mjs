import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Requires Start-FINOS.ps1. Posts one paise of demo funds per run.
const base = 'http://127.0.0.1:5173';
async function get(path) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  return response.json();
}
async function post(path, body, key) {
  return fetch(base + '/api' + path, {method:'POST', headers:{'Content-Type':'application/json', ...(key ? {'Idempotency-Key':key} : {})}, body:JSON.stringify(body)});
}
test('frontend proxy, settlement, durable retry, Kafka projection and event stream', {timeout:30000}, async () => {
  const page=await fetch(base);
  assert.equal(page.status,200);
  assert.match(await page.text(), /FINOS-Core/);
  assert.equal((await get('/actuator/health')).status,'UP');
  const before=await get('/api/state');
  assert.equal(before.system.eventMode,'kafka');
  assert.equal(before.reconciliation.healthy,true);
  const key=randomUUID();
  const request={sourceId:'00000000-0000-0000-0000-000000000101',destinationId:'00000000-0000-0000-0000-000000000102',amountMinor:'1',currency:'INR',reference:'SMOKE-'+key,quoteId:null};
  const firstResponse=await post('/transfers',request,key);
  assert.equal(firstResponse.status,201);
  const first=await firstResponse.json();
  assert.equal(first.replayed,false);
  const replayResponse=await post('/transfers',request,key);
  assert.equal(replayResponse.status,201);
  const replay=await replayResponse.json();
  assert.equal(replay.replayed,true);
  assert.deepEqual(replay.receipt,first.receipt);
  assert.equal((await post('/transfers',{...request,amountMinor:'2'},key)).status,422);
  let after;
  for(let attempt=0;attempt<50;attempt++) {
    after=await get('/api/state');
    if(after.counts.unprojected_events===0) break;
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.equal(after.counts.transfers,before.counts.transfers+1);
  assert.equal(after.counts.journal_entries,before.counts.journal_entries+2);
  assert.equal(after.counts.consumed,before.counts.consumed+1);
  assert.equal(after.counts.unprojected_events,0);
  assert.equal(after.reconciliation.healthy,true);
  const source=s=>s.accounts.find(a=>a.id===request.sourceId);
  assert.equal(BigInt(source(after).balance),BigInt(source(before).balance)-1n);
  assert.equal((await post('/pipeline/replay/'+first.receipt.eventId,{})).status,200);
  assert.equal((await get('/api/state')).counts.consumed,after.counts.consumed);
  const controller=new AbortController();
  try {
    const stream=await fetch(base+'/api/events',{signal:controller.signal});
    assert.match(stream.headers.get('content-type'),/text\/event-stream/);
    const chunk=await stream.body.getReader().read();
    assert.match(new TextDecoder().decode(chunk.value),/event:refresh/);
  } finally { controller.abort(); }
});

test('live provider returns fresh timestamped FX and an executable demo quote', {skip:process.env.LIVE_FX!=='true',timeout:15000}, async()=>{
  const market=await get('/api/market');
  assert.equal(market.available,true);
  assert.equal(market.stale,false);
  assert.ok(market.asOf);
  const quoteResponse=await post('/quotes',{currency:'USD',amountMinor:'100'});
  assert.equal(quoteResponse.status,200);
  assert.ok(BigInt((await quoteResponse.json()).settlementAmountMinor)>0n);
});
