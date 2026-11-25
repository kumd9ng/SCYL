import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json'};
export function createSCYLServer({ built = false } = {}) {
const staticRoot = built ? path.join(root, 'www') : root;
return http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/metadata'){
      const id=url.searchParams.get('id');
      if(!/^[A-Za-z0-9_-]{11}$/.test(id||'')){res.writeHead(400);return res.end('Invalid video');}
      const r=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+id),{signal:AbortSignal.timeout(7000)});
      if(!r.ok){res.writeHead(502);return res.end('Metadata unavailable');}
      const d=await r.json();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public,max-age=3600'});return res.end(JSON.stringify({title:d.title,author:d.author_name}));
    }
    const requested=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const sourcePattern = /^\/(?:index\.html|privacy\.html|mix-lab\.html|auth\.html|audio-analysis-worker\.js|(?:style|mix-lab|account|theme|apple-music)\.css|(?:app|privacy|mix-lab|auth)\.mjs|manifest\.webmanifest|assets\/[\w.-]+\.(?:svg|png)|lib\/[\w.-]+\.mjs)$/;
    const builtPattern = /^\/(?:index\.html|privacy\.html|mix-lab\.html|auth\.html|(?:app|privacy|mix-lab|auth|audio-analysis-worker|audio-render-check)\.js|(?:style|mix-lab|account|theme|apple-music)\.css|manifest\.webmanifest|assets\/[\w.-]+\.(?:svg|png)|chunks\/[\w-]+\.js)$/;
    if(!(built ? builtPattern : sourcePattern).test(requested)){res.writeHead(404);return res.end('Not found');}
    const data=await readFile(path.join(staticRoot,!built && requested === '/audio-analysis-worker.js' ? '/audio-analysis-worker.mjs' : requested));
    res.writeHead(200,{'Content-Type':mime[path.extname(requested)]||'application/octet-stream','Referrer-Policy':'strict-origin-when-cross-origin','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(data);
  }catch(e){res.writeHead(e.code==='ENOENT'?404:502);res.end('Request unavailable');}
});
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createSCYLServer({ built: process.argv.includes('--built') });
  server.listen(Number(process.env.PORT)||4317,'127.0.0.1',()=>console.log('SCYL ready: http://127.0.0.1:'+server.address().port));
}
