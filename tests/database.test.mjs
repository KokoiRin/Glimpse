import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
let db;
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const batch=JSON.parse(await readFile(new URL('../content/initial-cards.json',import.meta.url),'utf8'));
const card=batch.cards[0];
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
});
after(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec('reset role;truncate public.record_operations,public.personal_records,public.cards,auth.users cascade;');
 await db.query('insert into auth.users(id) values($1),($2)',[A,B]);
 await db.query('select public.publish_card_batch($1)',[JSON.stringify(batch)]);
});
async function as(role,uid,fn){await db.exec(`set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);try{return await fn();}finally{await db.exec('reset role');}}
const op=(kind,extra={})=>({op_id:randomUUID(),kind,card:{id:card.id,title:card.title,topic:card.topic,parent:card.parent,version:card.version},at:new Date().toISOString(),...extra});
async function apply(uid,ops){return (await db.query('select public.apply_record_ops($1,$2) result',[uid,JSON.stringify(ops)])).rows[0].result;}
test('anonymous visitors only read published cards and cannot publish or read personal records',async()=>{
 await db.query('update public.cards set published=false where id=$1',[card.id]);
 await as('anon',null,async()=>{
  const rows=(await db.query('select * from public.cards')).rows;
  assert.equal(rows.length,6);assert(rows.every(row=>row.payload.energy==='low'));
  assert.equal((await db.query('select * from public.cards where id=$1',[card.id])).rows.length,0);
  await assert.rejects(db.query('select * from public.personal_records'),/permission denied/);
  await assert.rejects(db.query('select public.publish_card_batch($1)',[JSON.stringify(batch)]),/permission denied/);
  await assert.rejects(apply(A,[op('open')]),/permission denied/);
 });
});
test('authenticated users cannot read, mutate, or impersonate another account',async()=>{
 await as('authenticated',A,()=>apply(A,[op('open'),op('rate',{reaction:'like'})]));
 await as('authenticated',B,async()=>{
  assert.deepEqual((await db.query('select * from public.personal_records')).rows,[]);
  await assert.rejects(apply(A,[op('rate',{reaction:'dislike'})]),/Wrong account/);
  await assert.rejects(db.query("update public.personal_records set reaction='dislike'"),/permission denied/);
  await assert.rejects(db.query('insert into public.cards select * from public.cards'),/permission denied/);
 });
});
test('retrying the same operation does not double count and explicit clearing is retained',async()=>{
 const open=op('open');
 await as('authenticated',A,async()=>{
  await apply(A,[open]);const rows=await apply(A,[open,op('rate',{reaction:'like'}),op('rate',{reaction:null})]);
  assert.equal(rows[0].opens,1);assert.equal(rows[0].reaction,null);assert(rows[0].rated_at);
 });
});
test('import retry is idempotent and preserves existing explicit cloud feedback, including clears',async()=>{
 const imported=op('import',{opens:3,reaction:'like',lastOpenedAt:'2026-09-01T00:00:00Z',ratedAt:'2026-09-01T00:00:00Z'});
 await as('authenticated',A,async()=>{
  await apply(A,[op('rate',{reaction:null})]);await apply(A,[imported]);const rows=await apply(A,[imported]);
  assert.equal(rows[0].opens,3);assert.equal(rows[0].reaction,null);
 });
});
test('unpublishing a card retains each users record',async()=>{
 await as('authenticated',A,()=>apply(A,[op('open')]));
 await db.query('select public.publish_card_batch($1)',[JSON.stringify({cards:[],unpublish:[card.id]})]);
 await as('authenticated',A,async()=>{assert.equal((await db.query('select * from public.personal_records')).rows.length,1);assert.equal((await db.query('select * from public.cards where id=$1',[card.id])).rows.length,0);});
});
test('an invalid later card rolls back the whole content batch',async()=>{
 const first={...card,id:'new-card'},bad={...card,id:'bad-card',widget:'execute-js'};
 await assert.rejects(db.query('select public.publish_card_batch($1)',[JSON.stringify({cards:[first,bad],unpublish:[]})]),/Invalid widget/);
 assert.equal((await db.query("select * from public.cards where id='new-card'")).rows.length,0);
});
test('content edits require increased versions and initial seeds cannot overwrite newer content',async()=>{
 const changed={...card,title:'新版',version:2};await db.query('select public.publish_card_batch($1)',[JSON.stringify({cards:[changed],unpublish:[]})]);
 await assert.rejects(db.query('select public.publish_card_batch($1)',[JSON.stringify(batch)]),/Increase version/);
 await assert.rejects(db.query('select public.publish_card_batch($1)',[JSON.stringify({cards:[{...changed,title:'未加版本'}],unpublish:[]})]),/Increase version/);
 assert.equal((await db.query('select payload from public.cards where id=$1',[card.id])).rows[0].payload.title,'新版');
});

test('members can read knowledge and light cards but never unpublished cards',async()=>{
 await as('authenticated',A,async()=>{const rows=(await db.query('select * from public.cards')).rows;assert.equal(rows.length,14);assert(rows.some(r=>r.payload.energy==='high'));});
 await db.query('update public.cards set published=false where id=$1',[card.id]);
 await as('authenticated',A,async()=>assert.equal((await db.query('select * from public.cards')).rows.length,13));
});

test('seen operations are idempotent, isolated and never imply opening or liking',async()=>{
 const seen=op('seen');
 await as('authenticated',A,async()=>{const first=await apply(A,[seen]);const again=await apply(A,[seen,op('seen')]);assert(first[0].seen_at);assert.equal(first[0].seen_at,again[0].seen_at);assert.equal(again[0].opens,0);assert.equal(again[0].reaction,null);});
 await as('authenticated',B,async()=>{assert.deepEqual((await db.query('select * from public.personal_records')).rows,[]);await assert.rejects(apply(A,[op('seen')]),/Wrong account/);});
 await as('anon',null,()=>assert.rejects(apply(A,[op('seen')]),/permission denied/));
});
test('seen-only guest imports preserve cloud feedback and survive duplicate retries',async()=>{
 const imported=op('import',{opens:0,reaction:null,ratedAt:null,lastOpenedAt:null,seenAt:'2026-09-20T00:00:00Z'});
 await as('authenticated',A,async()=>{const rows=await apply(A,[imported,imported]);assert(rows[0].seen_at);assert.equal(rows[0].opens,0);assert.equal(rows[0].reaction,null);});
});
