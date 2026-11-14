import fs from 'node:fs/promises';
import http from 'node:http';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const base="V:/tmp/codex/2026-11-14/digit-lab-full-audit-2119/packaging";
const pkg=base+'/installed/node_modules/neural-network-digit-recognition';
const {createStaticServer,listenWithFallback}=await import(pathToFileURL(pkg+'/src/server.js'));
const server=createStaticServer({publicDir:pkg+'/public',sharedDir:pkg+'/src/shared'});
const port=await listenWithFallback(server,0);
const request=(target,method='GET',headers={})=>new Promise(resolve=>{const req=http.request({host:'127.0.0.1',port,path:target,method,headers},res=>{const chunks=[];res.on('data',d=>chunks.push(d));res.on('end',()=>{const body=Buffer.concat(chunks);resolve({target,method,status:res.statusCode,headers:res.headers,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex'),body:body.length<150?body.toString():undefined});});});req.on('error',e=>resolve({target,method,error:e.message}));req.end();});
const cases=['/','/js/app.js','/shared/neural-network.js','/samples/manifest.json','/samples/digit-0-00.png','/missing','/package.json','/../package.json','/%2e%2e%2fpackage.json','/..%5cpackage.json','/%2e%2e%5cpackage.json','/shared/%2e%2e%2fserver.js','/shared/%2e%2e%5cserver.js','/%252e%252e%252fpackage.json','/%2f..%2fpackage.json','/C:%5cWindows%5cwin.ini','/%00','/%ZZ','/%C0%AF','//evil.test/path'];
const responses=[];
for(const p of cases)responses.push(await request(p));
for(const method of ['HEAD','POST','PUT','DELETE','OPTIONS','TRACE'])responses.push(await request('/',method));
responses.push({...await request('/','GET',{Host:'untrusted.example',Origin:'https://untrusted.example'}),case:'foreign-host-origin'});
const manifest=JSON.parse(await fs.readFile(pkg+'/public/samples/manifest.json','utf8'));
const files=await fs.readdir(pkg+'/public/samples');
const pngs=files.filter(f=>f.endsWith('.png'));
const assetChecks=[];
for(const f of pngs){const b=await fs.readFile(pkg+'/public/samples/'+f);const r=await request('/samples/'+f);assetChecks.push({file:f,width:b.readUInt32BE(16),height:b.readUInt32BE(20),status:r.status,sameHash:r.sha256===createHash('sha256').update(b).digest('hex')});}
const runtime={address:server.address(),responses,assetChecks,manifestCount:manifest.samples.length};
await new Promise(r=>server.close(r));
const blockers=[];let start;
for(let attempt=0;attempt<100;attempt++){start=45000+attempt*10;try{for(let i=0;i<10;i++){const b=http.createServer();b.listen(start+i,'127.0.0.1');await once(b,'listening');blockers.push(b);}break;}catch(e){for(const b of blockers)await new Promise(r=>b.close(r));blockers.length=0;}}
if(blockers.length===10){const s=createStaticServer({publicDir:pkg+'/public',sharedDir:pkg+'/src/shared'});try{await listenWithFallback(s,start);runtime.allTenBusy={unexpectedSuccess:true};}catch(e){runtime.allTenBusy={code:e.code,message:e.message};}finally{if(s.listening)await new Promise(r=>s.close(r));}await new Promise(r=>blockers[1].close(r));const s2=createStaticServer({publicDir:pkg+'/public',sharedDir:pkg+'/src/shared'});const chosen=await listenWithFallback(s2,start);runtime.fallback={start,chosen,expected:start+1,address:s2.address()};await new Promise(r=>s2.close(r));for(const b of blockers)if(b.listening)await new Promise(r=>b.close(r));}
await fs.writeFile(base+'/server-probes.json',JSON.stringify(runtime,null,2));
console.log(JSON.stringify({address:runtime.address,statuses:responses.map(r=>[r.target,r.method,r.status]),samples:assetChecks.length,badSamples:assetChecks.filter(r=>r.width!==16||r.height!==16||r.status!==200||!r.sameHash),fallback:runtime.fallback,allTenBusy:runtime.allTenBusy}));
