import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const nativeFetch=fetch;
const root=new URL('../',import.meta.url);
const contexts=new Map();
let fetcher;
const processEnv={NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'publishable-test-key'};
let sessionToken='user-session-token';
function module(path) {
  if(contexts.has(path)) return contexts.get(path).exports;
  const source=readFileSync(new URL(path,root),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};contexts.set(path,{exports});
  const context={exports,Buffer,URL,Request,Response,AbortSignal,Uint8Array,atob,process:{env:processEnv},fetch:(...args)=>fetcher(...args),require:(name)=>{
    if(name==='server-only')return {};
    if(name==='../supabase/server')return {serverClient:async()=>({auth:{getSession:async()=>({data:{session:sessionToken?{access_token:sessionToken}:null},error:null})}})};
    if(name.endsWith('auth/api-access')) return {requireCloudAccess:async()=>null};
    if(name.startsWith('.')) return module(new URL(`${name}.ts`,new URL(path,root)).pathname.slice(root.pathname.length));
    return require(name);
  }};
  vm.runInNewContext(code,context,{filename:path});return exports;
}
const routes=module('app/api/studio/route.ts');
const media=module('app/api/studio/media/route.ts');
const validation=module('app/server/studio-validation.ts');
const client=module('app/chains/cloud-storage.ts');
const cid='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002',rid='00000000-0000-4000-8000-000000000003';
const step={id:sid,name:'Caption',prompt:'Write a caption',outputType:'text'};
const chain={id:cid,name:'A chain',description:'',steps:[step],updatedAt:new Date().toISOString(),revision:1};
const run={id:rid,chainId:cid,chainName:'A chain',createdAt:new Date().toISOString(),input:{type:'text',content:'An office dog'},status:'completed',results:[{step,status:'completed',output:{type:'text',content:'CEO of treats'}}]};
let requests=[];
fetcher=async(url,init={})=>{
  requests.push({url,init});
  if(String(url).includes('prompt_studio_save_chain'))return Response.json({...JSON.parse(init.body).p_chain,revision:2});
  return new Response(null,{status:204});
};
const put=value=>new Request('http://localhost/api/studio',{method:'PUT',headers:{origin:'http://localhost'},body:JSON.stringify(value)});
let response=await routes.PUT(put({store:'chains',value:chain}));
assert.equal(response.status,200);assert.equal((await response.json()).revision,2);
assert.equal(JSON.parse(requests.at(-1).init.body).p_expected_revision,1);
assert.equal(requests.at(-1).init.headers.apikey,'publishable-test-key');
assert.equal(requests.at(-1).init.headers.Authorization,'Bearer user-session-token');
response=await routes.PUT(put({store:'runs',value:run}));assert.equal(response.status,200);
const before=requests.length;
response=await routes.PUT(put({store:'chains',value:{...chain,steps:[step,step]}}));assert.equal(response.status,400);
response=await routes.PUT(put({store:'runs',value:{...run,input:{type:'image',content:'https://untrusted.example/image.png'}}}));assert.equal(response.status,400);
response=await routes.PUT(new Request('http://localhost/api/studio',{method:'PUT',headers:{origin:'https://evil.example'},body:'{}'}));assert.equal(response.status,403);
assert.equal(requests.length,before,'invalid writes do not reach Supabase');
assert.throws(()=>validation.validateRun({...run,results:[{step,status:'pending'}]}),/Invalid step/);
fetcher=async()=>Response.json({code:'40001'},{status:409});
response=await routes.PUT(put({store:'chains',value:chain}));assert.equal(response.status,409);
fetcher=async()=>Response.json({code:'PGRST202'},{status:404});
response=await routes.GET(new Request('http://localhost/api/studio?store=chains'));assert.equal(response.status,503);assert.match((await response.json()).error,/SQL Editor/);
delete processEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
response=await routes.GET(new Request('http://localhost/api/studio?store=chains'));assert.equal(response.status,503);assert.match((await response.json()).error,/publishable key/);
processEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='publishable-test-key';
sessionToken=null;
response=await routes.GET(new Request('http://localhost/api/studio?store=chains'));assert.equal(response.status,401);
sessionToken='user-session-token';

// Image uploads are binary, idempotent, private, and use durable relative URLs.
requests=[];
fetcher=async(url,init={})=>{requests.push({url,init});return String(url).includes('/rest/')?Response.json([{id:cid}]):Response.json({Key:'saved'});};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6L8AAAAASUVORK5CYII=','base64');
response=await media.POST(new Request(`http://localhost/api/studio/media?chain=${cid}&run=${rid}&step=${sid}`,{method:'POST',headers:{'Content-Type':'image/png',origin:'http://localhost'},body:png}));
assert.equal(response.status,200);const savedMedia=await response.json();assert.match(savedMedia.storagePath,/\.png$/);assert.match(savedMedia.content,/^\/api\/studio\/media\?path=/);
assert.ok(requests.at(-1).url.includes('/storage/v1/object/prompt-studio-media/'));
response=await media.POST(new Request(`http://localhost/api/studio/media?chain=${cid}&run=${rid}&step=${sid}`,{method:'POST',headers:{'Content-Type':'image/png'},body:'not an image'}));assert.equal(response.status,400);
response=await media.GET(new Request('http://localhost/api/studio/media?path=../../another-bucket'));assert.equal(response.status,400);

// Fetch paginated history and preserve step ordering; no image base64 in DB JSON.
fetcher=async(url)=>{
  if(String(url).includes('prompt_studio_chains'))return Response.json([{id:cid,name:'Cloud chain',description:'',revision:4,updated_at:chain.updatedAt,prompt_studio_steps:[{...step,output_type:'text',position:1},{...step,id:rid,name:'First',output_type:'text',position:0}]}]);
  return Response.json([]);
};
response=await routes.GET(new Request('http://localhost/api/studio?store=chains'));
assert.equal((await response.json())[0].steps[0].name,'First');

let uploads=0,writes=[];
fetcher=async(url,init)=>{
  if(url.startsWith('/api/studio/media')){uploads++;assert.ok(init.body instanceof Uint8Array);return Response.json(savedMedia);}
  writes.push(JSON.parse(init.body));return Response.json(JSON.parse(init.body).value);
};
const imageRun={...run,results:[{...run.results[0],output:{type:'image',content:`data:image/png;base64,${png.toString('base64')}`}}]};
await client.put('runs',imageRun);await client.put('runs',imageRun);
assert.equal(uploads,1,'previous images are not reuploaded on each status update');
assert.ok(!JSON.stringify(writes).includes('base64,'),'database writes contain only image references');
client.releaseUploads();
fetcher=async()=>new Response(JSON.stringify({error:'Unavailable'}),{status:503});
await assert.rejects(client.all('chains'),/Unavailable/,'never silently fall back to local-only saves');
assert.ok(nativeFetch);
console.log('Cloud tests passed: save/load, revisions, validation, origin checks, missing setup, private binary media, ordering, upload caching, and honest save failures.');
