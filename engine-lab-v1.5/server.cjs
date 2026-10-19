const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,port=Number(process.env.ENGINE_LAB_PORT||4328),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({app:'engine-lab',version:1,pid:process.pid}));}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  let relative;try{relative=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end();}
  if(relative.includes('\\')||relative.includes('\0')){res.writeHead(403);return res.end();}
  const file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'"});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);});
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is occupied. Choose ENGINE_LAB_PORT or open the existing Engine Lab.`:e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Engine Lab: http://127.0.0.1:${port}`));
