import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeed, swipeDirection } from '../public/navigation.js';
import { createFeedback } from '../public/feedback.js';
import { readFileSync } from 'node:fs';
const cards=JSON.parse(readFileSync(new URL('../content/initial-cards.json',import.meta.url),'utf8')).cards;
const samples=cards.slice(0,4);
function memory(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}

test('previous then next revisits the same card without redrawing the deck',()=>{const f=createFeed(samples);const a=f.current;assert.equal(f.previous(),false);f.next();const b=f.current;f.previous();assert.equal(f.current,a);f.next();assert.equal(f.current,b);});
test('a full deck is finite, unique and can still be traversed backward from its end',()=>{const f=createFeed(cards);const seen=[f.current.id];while(f.next())seen.push(f.current.id);assert.equal(new Set(seen).size,cards.length);assert.equal(f.next(),false);const last=f.current;f.previous();f.next();assert.equal(f.current,last);});
test('light mode includes only relaxation and everyday scenes',()=>{const f=createFeed(cards,{energy:'low'});do{assert.equal(f.current.energy,'low');assert.match(f.current.type,/生活/);}while(f.next());});
test('explicit history entry opens the chosen card, independently of shuffle',()=>{const f=createFeed(cards,{firstId:'composition'});assert.equal(f.current.id,'composition');});
test('empty filtered deck has no current card and neither direction moves',()=>{const f=createFeed([]);assert.equal(f.current,undefined);assert.equal(f.next(),false);assert.equal(f.previous(),false);});
test('left and right gestures navigate while vertical, diagonal and small motions do not',()=>{const start={x:150,y:150};assert.equal(swipeDirection(start,{x:60,y:155}),'next');assert.equal(swipeDirection(start,{x:250,y:160}),'previous');assert.equal(swipeDirection(start,{x:160,y:350}),null);assert.equal(swipeDirection(start,{x:100,y:150}),null);assert.equal(swipeDirection(start,{x:50,y:260}),null);});
test('opening a card persists as seen without implying like or dislike',()=>{const s=memory(),f=createFeedback(s);f.open(cards[0]);const reread=createFeedback(s).get(cards[0].id);assert.equal(reread.opens,1);assert.equal(reread.reaction,null);assert.equal(reread.parent,cards[0].parent);});
test('opinions can be changed and removed without erasing opening history',()=>{const s=memory(),f=createFeedback(s);f.open(cards[0]);f.rate(cards[0],'like');f.rate(cards[0],'dislike');assert.equal(createFeedback(s).get(cards[0].id).reaction,'dislike');f.rate(cards[0],null);assert.equal(f.get(cards[0].id).opens,1);assert.equal(f.get(cards[0].id).reaction,null);});
test('a disliked card can be excluded from new rounds and recovered after unmarking',()=>{const f=createFeedback(memory());f.rate(cards[0],'dislike');const eligible=()=>cards.filter(c=>f.get(c.id)?.reaction!=='dislike');assert.equal(eligible().length,cards.length-1);f.rate(cards[0],null);assert.equal(eligible().length,cards.length);});
test('storage denial retains this visits feedback and reports it is not saved',()=>{const f=createFeedback({getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}});f.open(cards[0]);f.rate(cards[0],'like');assert.equal(f.available,false);assert.equal(f.get(cards[0].id).reaction,'like');});
test('clear removes explicit feedback and persisted seen history',()=>{const s=memory(),f=createFeedback(s);f.open(cards[0]);f.rate(cards[0],'like');f.clear();assert.deepEqual(createFeedback(s).all(),[]);});
test('card catalog uses stable ids, explicit concept origins and the requested scope',()=>{assert.equal(cards.length,14);assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);assert.equal(cards.filter(c=>c.energy==='high').length,8);assert.equal(cards.filter(c=>c.energy==='low').length,6);for(const c of cards){assert(c.parent.includes('→'));assert(c.version>=1);assert(c.teaser&&c.trial&&c.more&&c.source);assert(!/游戏|个人项目/.test(c.type));if(c.link)assert(c.link.startsWith('https://'));}});

test('large catalogs still produce at most fourteen cards per round',()=>{const many=Array.from({length:40},(_,i)=>({...cards[0],id:`item-${i}`}));const f=createFeed(many);let count=1;while(f.next())count++;assert.equal(count,14);});

test('unseen cards exhaust before a randomly shuffled history round, including a short final new round',()=>{
 const seenIds=new Set(cards.slice(0,12).map(c=>c.id));
 const feed=createFeed(cards,{seenIds,random:()=>0.25});const newIds=[];
 do{newIds.push(feed.current.id);seenIds.add(feed.current.id);}while(feed.next());
 assert.equal(newIds.length,2);assert(newIds.every(id=>cards.slice(12).some(c=>c.id===id)));
 const history=createFeed(cards,{seenIds,limit:5,random:()=>0.25});const old=[];
 do{old.push(history.current.id);}while(history.next());assert.equal(old.length,5);assert.equal(new Set(old).size,5);
 assert.notDeepEqual(old,cards.slice(0,5).map(c=>c.id));
});
test('drawing a deck does not mark undelivered cards seen and explicit history can open a seen card',()=>{
 const seenIds=new Set([cards[0].id]),f=createFeed(cards,{seenIds,limit:2});
 assert.equal(seenIds.size,1);assert.notEqual(f.current.id,cards[0].id);
 const h=createFeed(cards,{seenIds,firstId:cards[0].id});assert.equal(h.current.id,cards[0].id);
});
test('a seen card stays seen after edits and a new id is preferred after all old cards were read',()=>{
 const seenIds=new Set(cards.map(c=>c.id));const edited={...cards[0],version:2},fresh={...cards[0],id:'fresh'};
 assert.equal(createFeed([...cards.slice(1),edited,fresh],{seenIds}).current.id,'fresh');
});
test('seeing a guest card persists independently of opening or explicit feedback',()=>{
 const s=memory(),f=createFeedback(s);f.see(cards[0]);const at=f.get(cards[0].id).seenAt;f.see(cards[0]);
 const row=createFeedback(s).get(cards[0].id);assert.equal(row.seenAt,at);assert.equal(row.opens,0);assert.equal(row.reaction,null);
});

test('one hundred new cards are each delivered once before historical replay begins',()=>{
 const batch=JSON.parse(readFileSync(new URL('../content/2026-09-29-light-100.json',import.meta.url))).cards;
 const seenIds=new Set(cards.map(c=>c.id)),delivered=[];
 while(seenIds.size<cards.length+100){
  const f=createFeed([...cards,...batch],{seenIds});let round=0;
  do{assert(!seenIds.has(f.current.id));seenIds.add(f.current.id);delivered.push(f.current.id);round++;}while(f.next());
  assert(round<=14);
 }
 assert.equal(delivered.length,100);assert.equal(new Set(delivered).size,100);
 const replay=createFeed([...cards,...batch],{seenIds});assert(seenIds.has(replay.current.id));
});
