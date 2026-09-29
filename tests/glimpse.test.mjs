import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../public');
const cards = JSON.parse(readFileSync(new URL('../content/initial-cards.json',import.meta.url),'utf8')).cards;
import { createFeed, swipeDirection } from '../public/navigation.js';
import { createRecords } from '../public/records.js';
import { createCatalog } from '../public/catalog.js';
const appCode = readFileSync(resolve(root, 'app.js'), 'utf8').replace(/^import .*;$/gm, '').replace('export const ready','const ready');

// Exercise the shipped controller with in-memory browser boundaries, not a copy of its rules.
async function boot({blocked=false, saved, hidden=false,user=null,remote={list:async()=>[],apply:async()=>[]}}={}) {
 const nodes=new Map(), store=new Map(), handlers={}; let time=0,changeUser;
 if(saved)store.set('rin-glimpse-events-v1',saved);
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',open:false,style:{},addEventListener(type,fn){if(type==='close')this.closeHandler=fn;else this[type]=fn;},attributes:{},setAttribute(key,value){this.attributes[key]=value;},classList:{toggle(){}},close(){this.open=false;this.closeHandler?.();},showModal(){this.open=true;},focus(){},scrollIntoView(){},replaceChildren(){this.innerHTML='';},querySelector(){return node('child');},querySelectorAll(){return [];}});return nodes.get(id);};
 const document={hidden,getElementById:node,querySelector:node,addEventListener(type,fn){handlers[type]=fn;}};
 const context={createRecords,createCatalog,createFeed,swipeDirection,__SUPABASE_URL__:'http://fixture.test',__SUPABASE_KEY__:'test-key',createCloud:()=>({fetchCards:async()=>cards,auth:{signOut:async()=>({})},records:remote}),initializeAuth:async({onUser})=>{changeUser=onUser;onUser(user);return {};},document,performance:{now:()=>time},localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return store.get(k)??null;},setItem:(k,v)=>{if(blocked)throw Error('blocked');store.set(k,v);},removeItem:k=>store.delete(k)},window:{scrollTo(){},addEventListener(type,fn){handlers[type]=fn;}},history:{replaceState(){},pushState(){},back(){}},location:{pathname:'/',href:'http://fixture.test/'},URL,Blob,Date,Math,console};
 await vm.runInNewContext(appCode+'\nready',context);
 return {node,store,handlers,document,setUser:u=>changeUser(u),tick:n=>{time+=n;},events:()=>JSON.parse(store.get('rin-glimpse-events-v1')||'[]')};
}
test('a guest round displays all six light cards without duplicates then stops',async()=>{
 const h=await boot();for(let i=0;i<6;i++)h.node('skip').click();
 const shown=h.events().filter(e=>e.action==='impression');assert.equal(shown.length,6);assert.equal(new Set(shown.map(e=>e.cardId)).size,6);assert(shown.every(e=>cards.find(c=>c.id===e.cardId).energy==='low'));assert.equal(h.events().at(-1).action,'deck_end');
});
test('controller handles returning to the same earlier and later cards',async()=>{
 const h=await boot();const a=h.events().at(-1).cardId;h.node('skip').click();const b=h.events().at(-1).cardId;h.node('previous').click();assert.equal(h.events().at(-1).cardId,a);h.node('skip').click();assert.equal(h.events().at(-1).cardId,b);
});
test('a reload keeps records and avoids the immediately previous card',async()=>{
 const h=await boot();const previous=h.events().at(-1).cardId;const next=await boot({saved:h.store.get('rin-glimpse-events-v1')});assert.equal(next.events().length,2);assert.notEqual(next.events().at(-1).cardId,previous);
});
test('blocked browser storage still allows opening and ending an experience',async()=>{
 const h=await boot({blocked:true});assert.doesNotThrow(()=>{h.node('open').click();h.handlers.popstate();for(let i=0;i<14;i++)h.node('skip').click();});assert.match(h.node('#main').innerHTML,/这几张/);
});
test('time in the background is not counted as active experience time',async()=>{
 const h=await boot();h.tick(2000);h.document.hidden=true;h.handlers.visibilitychange();h.tick(60000);h.document.hidden=false;h.handlers.visibilitychange();h.tick(1000);h.node('skip').click();assert.equal(h.events().find(e=>e.action==='background').activeMs,2000);assert.equal(h.events().find(e=>e.action==='next').activeMs,1000);
});
test('clear removes saved records and the previously exported preview',async()=>{
 const h=await boot();h.node('export').click();assert(h.node('export-preview').innerHTML);await h.node('clear').click();assert.equal(h.store.has('rin-glimpse-events-v1'),false);assert.equal(h.node('export-preview').innerHTML,'');
});

test('controller saves positive and negative feedback as explicit choices',async()=>{const h=await boot();const id=h.events().at(-1).cardId;h.node('like').click();let rows=JSON.parse(h.store.get('glimpse-records-v1'));assert.equal(rows[id].reaction,'like');h.node('dislike').click();rows=JSON.parse(h.store.get('glimpse-records-v1'));assert.equal(rows[id].reaction,'dislike');h.node('dislike').click();rows=JSON.parse(h.store.get('glimpse-records-v1'));assert.equal(rows[id].reaction,null);});

test('clearing feedback updates the open detail when the data dialog closes',async()=>{
 const h=await boot();h.node('open').click();h.node('like').click();
 assert.equal(h.node('like').attributes['aria-pressed'],'true');
 h.node('data').click();await h.node('clear').click();h.node('#about').close();
 assert.equal(h.node('like').attributes['aria-pressed'],'false');
 assert.equal(h.node('feedback-note').textContent,'');
});

test('menu exposes records and data while pausing card keyboard navigation',async()=>{
 const h=await boot();const first=h.events().at(-1).cardId;
 h.node('menu-toggle').click();assert.equal(h.node('#menu-dialog').open,true);
 h.handlers.keydown({key:'ArrowRight'});assert.equal(h.events().at(-1).cardId,first);
 h.node('records').click();assert.equal(h.node('#menu-dialog').open,false);assert.equal(h.node('#history-dialog').open,true);
 h.node('#history-dialog').close();h.node('menu-toggle').click();h.node('data').click();assert.equal(h.node('#about').open,true);
});

test('dragging from a card button suppresses its click without changing cards',async()=>{
 const h=await boot(),surface=h.node('child'),id=h.events().at(-1).cardId;
 surface.pointerdown({button:0,pointerId:1,clientX:100,clientY:200,target:{closest:()=>({})}});
 surface.pointerup({pointerId:1,clientX:250,clientY:210});
 let prevented=false,stopped=false;surface.click({preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
 assert(prevented&&stopped);assert.equal(h.events().at(-1).cardId,id);
 surface.pointerdown({button:0,pointerId:2,clientX:100,clientY:200,target:{closest:()=>({})}});
 surface.pointerup({pointerId:2,clientX:101,clientY:200});
 surface.click({preventDefault(){assert.fail('normal tap should work');},stopPropagation(){}});
});

const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('signed-in members get knowledge cards and can move light-only filtering into the menu',async()=>{
 const h=await boot({user:{id:'a'}});assert.equal(h.node('relax').hidden,false);
 assert.doesNotMatch(h.node('#main').innerHTML,/id="any"|id="low"/);
 for(let i=0;i<14;i++)h.node('skip').click();
 let shown=JSON.parse(h.store.get('glimpse-events-v2:a')).filter(e=>e.action==='impression');
 assert.equal(shown.length,14);assert(shown.some(e=>cards.find(c=>c.id===e.cardId).energy==='high'));
 h.node('relax').click();await settle();
 for(let i=0;i<6;i++)h.node('skip').click();
 shown=JSON.parse(h.store.get('glimpse-events-v2:a')).filter(e=>e.action==='impression').slice(14);
 assert.equal(shown.length,6);assert(shown.every(e=>cards.find(c=>c.id===e.cardId).energy==='low'));
});
test('logout immediately clears member detail and cannot restore it through browser back',async()=>{
 const h=await boot({user:{id:'a'}});h.node('open').click();
 h.setUser(null);assert.doesNotMatch(h.node('#main').innerHTML,/class="trial"/);
 h.handlers.popstate();await settle();
 assert.equal(h.node('relax').hidden,true);
 for(let i=0;i<6;i++)h.node('skip').click();
 assert(h.events().filter(e=>e.action==='impression').every(e=>cards.find(c=>c.id===e.cardId).energy==='low'));
});
test('refreshing the same member session preserves the current round and detail',async()=>{
 const h=await boot({user:{id:'a'}});h.node('open').click();const markup=h.node('#main').innerHTML;
 h.setUser({id:'a'});await settle();assert.equal(h.node('#main').innerHTML,markup);
});

test('an unseen foreground card is persisted without requiring the detail button',async()=>{
 const h=await boot(),id=h.events().at(-1).cardId,row=JSON.parse(h.store.get('glimpse-records-v1'))[id];
 assert(row.seenAt);assert.equal(row.opens,0);assert.equal(row.reaction,null);
 h.node('records').click();assert.match(h.node('record-tabs').innerHTML,/浏览过/);assert.match(h.node('record-list').innerHTML,new RegExp(id));
});
test('background loading does not mark a card seen until it becomes visible',async()=>{
 const h=await boot({hidden:true});assert.equal(h.store.has('glimpse-records-v1'),false);
 assert.equal(h.events().filter(e=>e.action==='impression').length,0);
 h.document.hidden=false;h.handlers.visibilitychange();assert.equal(h.events().filter(e=>e.action==='impression').length,1);
 assert.equal(Object.keys(JSON.parse(h.store.get('glimpse-records-v1'))).length,1);
});

test('a new device waits for synced seen records before choosing its first card',async()=>{
 let release;
 const remote={list:()=>new Promise(resolve=>{release=resolve;}),apply:async()=>[]};
 const pending=boot({user:{id:'a'},remote});await settle();
 release(cards.slice(0,-1).map(c=>({card_id:c.id,metadata:c,opens:0,reaction:null,seen_at:'2026-09-01T00:00:00Z'})));
 const h=await pending;const events=JSON.parse(h.store.get('glimpse-events-v2:a'));
 assert.equal(events.find(e=>e.action==='impression').cardId,cards.at(-1).id);
 h.node('skip').click();assert.match(h.node('#main').innerHTML,/这几张/);
});
