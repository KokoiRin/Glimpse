// Local UI fixture only. Never deployed or used as proof of live Google authentication.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(import.meta.dirname,'../dist');
const seed=JSON.parse(await readFile(new URL('../content/initial-cards.json',import.meta.url),'utf8'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','apikey,authorization,x-client-info,content-type');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/rest/v1/cards'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(seed.cards.map(c=>({id:c.id,version:c.version,payload:c}))));return;}
 try{
  let pathname=decodeURIComponent(url.pathname).replace(/^\/Glimpse\//,'/');
  let file=resolve(root,'.'+pathname);if(file!==root&&!file.startsWith(root+sep))throw Error();
  if((await stat(file)).isDirectory())file=resolve(file,'index.html');
  const body=await readFile(file);res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(4183,'127.0.0.1',()=>console.log('Fixture preview http://localhost:4183/Glimpse/'));
