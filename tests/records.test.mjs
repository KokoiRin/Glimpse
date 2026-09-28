import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecords} from '../public/records.js';
import {createFeedback} from '../public/feedback.js';
const card={id:'test-card',version:1,title:'卡片',topic:'test',parent:'测试 → 记录'};
function memory(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
function server(){
 const data=new Map(),seen=new Set();let failure=false;
 return {set fail(v){failure=v;},async list(id){if(failure)throw Error();return structuredClone([...data.values()].filter(r=>r.user_id===id));},async apply(ops,id){if(failure)throw Error();for(const op of ops){const key=`${id}:${op.op_id}`;if(seen.has(key))continue;seen.add(key);const rid=`${id}:${op.card.id}`,row=data.get(rid)||{user_id:id,card_id:op.card.id,metadata:op.card,opens:0,reaction:null,last_opened_at:null,rated_at:null};if(op.kind==='open')row.opens++;else if(op.kind==='rate'){row.reaction=op.reaction;row.rated_at=op.at;}else{row.opens+=op.opens;if(!row.rated_at){row.reaction=op.reaction;row.rated_at=op.ratedAt;}}data.set(rid,row);}return this.list(id);}};
}
test('offline actions remain in a durable queue and sync once after reconnecting',async()=>{
 const storage=memory(),remote=server();remote.fail=true;
 const a=createRecords({storage,remote});a.setUser({id:'a'});a.open(card);a.rate(card,'like');await a.sync();
 assert.equal(a.get(card.id).opens,1);assert.equal(a.pendingCount,2);
 const reloaded=createRecords({storage,remote});reloaded.setUser({id:'a'});remote.fail=false;await reloaded.sync();await reloaded.sync();
 assert.equal(reloaded.pendingCount,0);assert.equal(reloaded.get(card.id).opens,1);assert.equal(reloaded.get(card.id).reaction,'like');
});
test('two devices share explicit reactions including a cleared reaction',async()=>{
 const remote=server(),a=createRecords({storage:memory(),remote}),b=createRecords({storage:memory(),remote});a.setUser({id:'a'});b.setUser({id:'a'});
 a.rate(card,'dislike');await a.sync();await b.sync();assert.equal(b.get(card.id).reaction,'dislike');
 b.rate(card,null);await b.sync();await a.sync();assert.equal(a.get(card.id).reaction,null);
});
test('switching accounts never displays the previous account or sends its queue under the next account',async()=>{
 const remote=server(),a=createRecords({storage:memory(),remote});remote.fail=true;a.setUser({id:'a'});a.rate(card,'like');await a.sync();
 a.setUser({id:'b'});assert.equal(a.get(card.id),undefined);remote.fail=false;await a.sync();assert.deepEqual(await remote.list('b'),[]);
 a.setUser({id:'a'});await a.sync();assert.equal(a.get(card.id).reaction,'like');
 a.setUser(null);assert.equal(a.get(card.id),undefined);
});
test('a response from an earlier session cannot replace the current account data',async()=>{
 let finish;const remote={list:()=>new Promise(resolve=>{finish=resolve;}),apply(){}};const a=createRecords({storage:memory(),remote});
 a.setUser({id:'a'});const pending=a.sync();a.setUser({id:'b'});finish([{user_id:'a',card_id:card.id,metadata:card,opens:10,reaction:'like'}]);await pending;assert.equal(a.get(card.id),undefined);
});
test('guest import is queued once and does not overwrite an existing cloud preference',async()=>{
 const storage=memory(),remote=server();createFeedback(storage).open(card);createFeedback(storage).rate(card,'like');
 const a=createRecords({storage,remote});a.setUser({id:'a'});a.rate(card,'dislike');await a.sync();
 assert.equal(a.hasGuestRecords,true);await a.mergeGuest();await a.mergeGuest();await a.sync();
 assert.equal(a.get(card.id).opens,1);assert.equal(a.get(card.id).reaction,'dislike');assert.equal(a.hasGuestRecords,false);
});
test('pending records prevent clearing account cache while offline',async()=>{const remote=server();remote.fail=true;const a=createRecords({storage:memory(),remote});a.setUser({id:'a'});a.open(card);await a.sync();assert.equal(await a.clear(),false);assert.equal(a.get(card.id).opens,1);});
test('storage denial does not silently discard guest records during import',async()=>{
 const base=memory();createFeedback(base).open(card);const blocked={...base,setItem(){throw Error();}};const a=createRecords({storage:blocked,remote:server()});a.setUser({id:'a'});assert.equal(await a.mergeGuest(),false);assert.equal(a.hasGuestRecords,true);
});
test('interrupted guest cleanup is recovered without duplicating imported records',async()=>{
 const base=memory(),remote=server();createFeedback(base).open(card);
 const faulty={...base,removeItem(key){if(key==='glimpse-records-v1')throw Error('temporarily blocked');base.removeItem(key);}};
 const first=createRecords({storage:faulty,remote});first.setUser({id:'a'});await first.mergeGuest();
 assert(base.getItem('glimpse-guest-transfer-v1'));
 const second=createRecords({storage:base,remote});second.setUser({id:'a'});await second.sync();
 assert.equal(second.get(card.id).opens,1);assert.equal(second.hasGuestRecords,false);assert.equal(base.getItem('glimpse-records-v1'),null);
});
