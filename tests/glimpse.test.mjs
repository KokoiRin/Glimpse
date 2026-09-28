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
async function boot({blocked=false, saved, hidden=false}={}) {
 const nodes=new Map(), store=new Map(), handlers={}; let time=0;
 if(saved)store.set('rin-glimpse-events-v1',saved);
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',open:false,style:{},addEventListener(type,fn){if(type==='close')this.closeHandler=fn;else this[type]=fn;},attributes:{},setAttribute(key,value){this.attributes[key]=value;},classList:{toggle(){}},close(){this.open=false;this.closeHandler?.();},showModal(){this.open=true;},focus(){},scrollIntoView(){},replaceChildren(){this.innerHTML='';},querySelector(){return node('child');},querySelectorAll(){return [];}});return nodes.get(id);};
 const document={hidden,getElementById:node,querySelector:node,addEventListener(type,fn){handlers[type]=fn;}};
 const context={createRecords,createCatalog,createFeed,swipeDirection,__SUPABASE_URL__:'http://fixture.test',__SUPABASE_KEY__:'test-key',createCloud:()=>({fetchCards:async()=>cards,auth:{},records:{}}),initializeAuth:async({onUser})=>{onUser(null);return {};},document,performance:{now:()=>time},localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return store.get(k)??null;},setItem:(k,v)=>{if(blocked)throw Error('blocked');store.set(k,v);},removeItem:k=>store.delete(k)},window:{scrollTo(){},addEventListener(type,fn){handlers[type]=fn;}},history:{replaceState(){},pushState(){},back(){}},location:{pathname:'/',href:'http://fixture.test/'},URL,Blob,Date,Math,console};
 await vm.runInNewContext(appCode+'\nready',context);
 return {node,store,handlers,document,tick:n=>{time+=n;},events:()=>JSON.parse(store.get('rin-glimpse-events-v1')||'[]')};
}
test('one round displays all fourteen cards without duplicates then stops',async()=>{
 const h=await boot();for(let i=0;i<14;i++)h.node('skip').click();
 const shown=h.events().filter(e=>e.action==='impression');assert.equal(shown.length,14);assert.equal(new Set(shown.map(e=>e.cardId)).size,14);assert.equal(h.events().at(-1).action,'deck_end');
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
