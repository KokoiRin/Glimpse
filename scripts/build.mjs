import { build } from 'esbuild';
import { cp, mkdir, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
try { process.loadEnvFile(resolve(root,'.env.local')); } catch(error) {if(error.code!=='ENOENT')throw error;}
const url=process.env.GLIMPSE_SUPABASE_URL || '';
const key=process.env.GLIMPSE_SUPABASE_PUBLISHABLE_KEY || '';
if(!url || !key)throw Error('请先在 .env.local 或部署环境中配置 GLIMPSE_SUPABASE_URL 和 GLIMPSE_SUPABASE_PUBLISHABLE_KEY。');
if(key.startsWith('sb_secret_'))throw Error('网页不能使用管理密钥');
if(key.startsWith('eyJ')) {let role;try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role;}catch{}if(role!=='anon')throw Error('网页只能使用 publishable key 或 anon key');}
await rm(resolve(root,'dist'),{recursive:true,force:true});
await mkdir(resolve(root,'dist'),{recursive:true});
await cp(resolve(root,'public'),resolve(root,'dist'),{recursive:true,filter:source=>!source.endsWith('.js')});
await build({entryPoints:[resolve(root,'public/app.js')],outfile:resolve(root,'dist/app.js'),bundle:true,format:'esm',target:['es2022'],define:{__SUPABASE_URL__:JSON.stringify(url),__SUPABASE_KEY__:JSON.stringify(key)},minify:true});
const output=await readFile(resolve(root,'dist/app.js'),'utf8');
for(const name of ['SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','GOOGLE_CLIENT_SECRET'])if(process.env[name] && output.includes(process.env[name]))throw Error('发布产物包含管理凭据');
console.log('Built static app in dist/');
