import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const root=new URL('../dist/',import.meta.url);
test('the deployed bundle and install resources work under the GitHub Pages subpath',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');
 for(const match of html.matchAll(/<(?:link|script)\b[^>]*?(?:href|src)="([^"#]+)"/g)){
  const url=new URL(match[1],'https://kokoirin.github.io/Glimpse/');assert(url.pathname.startsWith('/Glimpse/'));assert((await readFile(new URL(match[1],root))).length);
 }
 const bundle=await readFile(new URL('app.js',root),'utf8');assert(!bundle.includes('__SUPABASE_URL__'));assert(!bundle.includes("from '@supabase/supabase-js'"));
 assert((await readFile(new URL('privacy.html',root),'utf8')).includes('隐私与数据'));
 const files=await readdir(root,{recursive:true});assert(!files.some(f=>/node_modules|\.env|initial-cards|migrations|tests/.test(f)));
 const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root),'utf8'));
 for(const icon of manifest.icons)assert((await readFile(new URL(icon.src,root))).length);
});
