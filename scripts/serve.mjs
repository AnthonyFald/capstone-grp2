import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
export async function handleRequest(req,res){
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://127.0.0.1'),route=decodeURIComponent(url.pathname);
    let filename=path.resolve(root,'.'+route);
    if((filename!==root&&!filename.startsWith(root+path.sep))||route.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);res.end('Forbidden');return;}
    if((await stat(filename)).isDirectory()){
      if(!url.pathname.endsWith('/')){res.writeHead(301,{Location:url.pathname+'/'+url.search});res.end();return;}
      filename=path.join(filename,'index.html');
    }
    const content=await readFile(filename);res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);
  }catch{res.writeHead(404);res.end('Not found');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4175),server=http.createServer(handleRequest);
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Local port is already in use. Choose another PORT or open the existing preview.':e.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log('Capstone preview: http://127.0.0.1:'+port+'\nDemo 1: http://127.0.0.1:'+port+'/demo-1/\nCtrl+C stops the preview.'));
}
