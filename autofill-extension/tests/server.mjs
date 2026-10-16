import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const vendor={
  '/vendor/react.js':'node_modules/react/umd/react.development.js',
  '/vendor/react-dom.js':'node_modules/react-dom/umd/react-dom.development.js',
  '/vendor/vue.js':'node_modules/vue/dist/vue.global.js'
};
export async function startServer(){
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost'), relative=vendor[url.pathname] || decodeURIComponent(url.pathname).replace(/^\//,'');
      const file=path.resolve(root,relative || 'fixtures/generic.html');
      if(!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
      const content=await fs.readFile(file);
      res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html;charset=utf-8':file.endsWith('.js')?'text/javascript;charset=utf-8':file.endsWith('.css')?'text/css;charset=utf-8':'application/json;charset=utf-8'});res.end(content);
    }catch{res.writeHead(404);res.end('Local file unavailable. Install test dependencies if testing frameworks.');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,url:`http://127.0.0.1:${server.address().port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const {url}=await startServer();console.log(`Open ${url}/fixtures/generic.html or ${url}/fixtures/controlled.html. Ctrl+C to stop.`);
}
