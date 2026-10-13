import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
export async function handleRequest(req,res){
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://127.0.0.1');
    const route=decodeURIComponent(url.pathname),filename=path.resolve(root,'.'+(route==='/'?'/index.html':route));
    if(!filename.startsWith(root+path.sep)||route.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);res.end('Forbidden');return;}
    const content=await readFile(filename);res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);
  }catch{res.writeHead(404);res.end('Not found');}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=http.createServer(handleRequest);
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'The local port is already in use. Open http://127.0.0.1:'+port+' or set PORT to another local port.':e.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log('Meeting Notes is ready at http://127.0.0.1:'+port+'\nKeep this window open. Ctrl+C stops the local server. No paid API is used.'));
}
