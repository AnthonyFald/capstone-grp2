// Standalone localhost development service. It never contacts Cloudflare.
import http from 'node:http';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {LocalD1} from './local-d1.mjs';
import {handle} from './worker.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const appRoot=path.resolve(directory,'../..');
const privateRoot=path.join(appRoot,'desktop-build/demo3/.private');
const publicRoot=path.resolve(directory,'../public');
const port=4188,origin='http://127.0.0.1:'+port;
await mkdir(privateRoot,{recursive:true});
const tokenPath=path.join(privateRoot,'owner-token');
let ownerToken;
try{ownerToken=(await readFile(tokenPath,'utf8')).trim();if(ownerToken.length<32)throw Error('Invalid existing Capstone owner token.');}
catch(error){if(error.code!=='ENOENT')throw error;ownerToken='capstone_owner_'+crypto.randomBytes(32).toString('hex');await writeFile(tokenPath,ownerToken+'\n',{flag:'wx',mode:0o600});}
const db=new LocalD1(path.join(privateRoot,'local-d1.sqlite'));
db.exec(await readFile(path.join(directory,'schema.sql'),'utf8'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const env={CAPSTONE_DB:db,CAPSTONE_OWNER_TOKEN:ownerToken,CAPSTONE_FREE_ACCOUNT_VERIFIED:'false',ASSETS:{async fetch(request){
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  let route;try{route=decodeURIComponent(new URL(request.url).pathname);}catch{return new Response('Bad path',{status:400});}
  if(route.split('/').some(p=>p.startsWith('.'))||route.includes('\\'))return new Response('Forbidden',{status:403});
  let filename=path.resolve(publicRoot,'.'+route);
  if(filename!==publicRoot&&!filename.startsWith(publicRoot+path.sep))return new Response('Forbidden',{status:403});
  try{if((await stat(filename)).isDirectory())filename=path.join(filename,'index.html');const bytes=await readFile(filename);return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'}});}catch{return new Response('Capstone page not found',{status:404});}
}}};
const server=http.createServer(async(req,res)=>{
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){res.writeHead(403);res.end('Invalid host');return;}
  const requestOrigin='http://'+req.headers.host;
  if(req.headers.origin&&req.headers.origin!==requestOrigin){res.writeHead(403);res.end('Invalid origin');return;}
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>262144){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}const request=new Request(requestOrigin+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const response=await handle(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500,{'Content-Type':'text/plain'});res.end('Local Capstone request failed');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Capstone local port4188 is already in use.':'Capstone local server could not start.');process.exitCode=1;db.close();});
server.listen(port,'127.0.0.1',()=>{console.log('Capstone Demo3 local development: '+origin+'/');console.log('Local SQLite only. No Cloudflare resources or paid features are used.');console.log('Owner key is in desktop-build/demo3/.private/owner-token; it is never printed.');});
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close(()=>{db.close();process.exit(0);}));
