import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCatalog} from '../public/catalog.js';
import {validateBatch} from '../public/card-schema.js';
import {initializeAuth} from '../public/auth.js';
const cards=JSON.parse(readFileSync(new URL('../content/initial-cards.json',import.meta.url))).cards;
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};}
test('catalog changes appear on the next load and do not mutate an existing round',async()=>{
 let published=cards;const catalog=createCatalog({storage:storage(),fetchCards:async()=>published});
 const first=await catalog.load();published=[{...cards[0],version:2,title:'新版'}];const second=await catalog.load();
 assert.equal(first.cards.length,14);assert.notEqual(first.cards[0].title,'新版');assert.equal(second.cards[0].title,'新版');
});
test('failed loads use last successful cache, including an authoritative empty catalog',async()=>{
 let fail=false,published=cards;const s=storage(),catalog=createCatalog({storage:s,fetchCards:async()=>{if(fail)throw Error();return published;}});
 await catalog.load();fail=true;assert.equal((await catalog.load()).cards.length,14);
 fail=false;published=[];assert.equal((await catalog.load()).cards.length,0);
 fail=true;assert.equal((await catalog.load()).cards.length,0);
 const reread=createCatalog({storage:s,fetchCards:async()=>{throw Error();}});assert.deepEqual((await reread.load()).cards,[]);
});
test('first failed load has a retryable error and no invented cards',async()=>{const result=await createCatalog({storage:storage(),fetchCards:async()=>{throw Error();}}).load();assert(result.error);assert.equal(result.stale,false);assert.deepEqual(result.cards,[]);});
test('publisher rejects duplicate ids, unsupported widgets and executable links before publishing',()=>{
 assert.throws(()=>validateBatch({cards:[cards[0],cards[0]],unpublish:[]}));
 assert.throws(()=>validateBatch({cards:[{...cards[0],widget:'arbitrary-code'}],unpublish:[]}));
 assert.throws(()=>validateBatch({cards:[{...cards[0],link:'javascript:alert(1)'}],unpublish:[]}));
 assert.throws(()=>validateBatch({cards:[cards[0]],unpublish:[cards[0].id]}));
});
test('PKCE code is exchanged before URL cleanup and session restoration',async()=>{
 const sequence=[];const auth={exchangeCodeForSession:async code=>{assert.equal(code,'code-value');sequence.push('exchange');return {};},getSession:async()=>{sequence.push('session');return {data:{session:{user:{id:'a'}}}};},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
 const result=await initializeAuth({auth,url:'https://example.com/Glimpse/?code=code-value',replaceUrl:url=>{sequence.push('clean');assert.equal(url,'/Glimpse/');},onUser:u=>{assert.equal(u.id,'a');sequence.push('user');}});
 assert.equal(result.error,null);assert.deepEqual(sequence,['exchange','clean','session','user']);
});
test('cancelled Google login removes the error parameters and leaves guest access intact',async()=>{
 const auth={getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
 const result=await initializeAuth({auth,url:'https://example.com/Glimpse/?error=access_denied&error_description=private',replaceUrl:url=>assert.equal(url,'/Glimpse/'),onUser:u=>assert.equal(u,null)});assert(result.error);
});

test('cancelled login errors in the URL fragment are reported and removed',async()=>{
 const auth={getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
 const result=await initializeAuth({auth,url:'https://example.com/Glimpse/#error=access_denied&error_description=cancelled',replaceUrl:url=>assert.equal(url,'/Glimpse/'),onUser:u=>assert.equal(u,null)});assert(result.error);
});
