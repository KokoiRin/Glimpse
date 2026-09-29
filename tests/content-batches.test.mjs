import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateBatch,validateCards} from '../public/card-schema.js';
test('the new content batch validates alongside the original catalog without overwriting cards',()=>{
 const initial=JSON.parse(readFileSync(new URL('../content/initial-cards.json',import.meta.url))).cards;
 const batch=validateBatch(JSON.parse(readFileSync(new URL('../content/2026-09-29-exploration.json',import.meta.url))));
 validateCards([...initial,...batch.cards]);assert.equal(batch.cards.length,14);assert.equal(batch.unpublish.length,0);
 const psychology=batch.cards.filter(c=>c.topic==='psychology');assert.equal(psychology.length,3);assert(psychology.every(c=>c.energy==='low'&&c.link));
 assert.equal(batch.cards.filter(c=>c.energy==='low').length,6);
 assert(batch.cards.filter(c=>c.energy==='high').every(c=>c.link&&/^(计算机|数学)/.test(c.type)));
});

test('the hundred light cards are distinct, complete, and do not replace existing content',()=>{
 const initial=JSON.parse(readFileSync(new URL('../content/initial-cards.json',import.meta.url))).cards;
 const previous=JSON.parse(readFileSync(new URL('../content/2026-09-29-exploration.json',import.meta.url))).cards;
 const batch=validateBatch(JSON.parse(readFileSync(new URL('../content/2026-09-29-light-100.json',import.meta.url))));
 validateCards([...initial,...previous,...batch.cards]);
 assert.equal(batch.cards.length,100);assert.equal(batch.unpublish.length,0);assert(batch.cards.every(c=>c.energy==='low'));
 assert.equal(new Set(batch.cards.map(c=>c.title)).size,100);assert.equal(new Set(batch.cards.map(c=>c.trial)).size,100);
 assert(batch.cards.every(c=>c.source.includes('原创')));
});
