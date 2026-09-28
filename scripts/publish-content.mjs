import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { validateBatch } from '../public/card-schema.js';
try { process.loadEnvFile('.env.local'); } catch(error) {if(error.code!=='ENOENT')throw error;}
const args=process.argv.slice(2);
const index=args.indexOf('--file');
if(index<0 || !args[index+1])throw Error('用法: npm run content:publish -- --file 内容.json [--publish]；默认仅校验');
const batch=validateBatch(JSON.parse(await readFile(args[index+1],'utf8')));
console.log(`校验通过：发布 ${batch.cards.length} 张，下架 ${batch.unpublish.length} 张。`);
if(args.includes('--publish')) {
  const url=process.env.GLIMPSE_SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !secret)throw Error('缺少内容发布所需的本地服务配置');
  const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.rpc('publish_card_batch',{p_batch:batch});
  if(error)throw Error(`发布失败，整批未生效：${error.message}`);
  console.log('发布完成：',data);
} else console.log('未写入云端。确认内容后加 --publish 发布。');
