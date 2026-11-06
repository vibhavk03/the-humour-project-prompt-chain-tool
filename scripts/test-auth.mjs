import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const root=new URL('../',import.meta.url);
function load(file,mocks={}) {
  const code=ts.transpileModule(readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const context={exports:{},Request,Response,URL,process:{env:{}},require:name=>{
    if(name==='server-only')return {};
    if(Object.hasOwn(mocks,name))return mocks[name];
    return require(name);
  }};
  vm.runInNewContext(code,context,{filename:file});return context.exports;
}
const redirects=load('app/auth/return-path.ts');
for(const path of ['https://evil.example','//evil.example','/\\evil.example','/login','/admin','javascript:alert(1)',null,[]]) assert.equal(redirects.returnPath(path),'/');
assert.equal(redirects.returnPath('/chains'),'/chains');
assert.equal(redirects.loginError('<script>alert(1)</script>'),'');

let currentUser=null,authError=null,profile=null,profileError=null,clientReady=true;
let reads=0;
const client={auth:{getUser:async()=>({data:{user:currentUser},error:authError})},from:name=>{
  assert.equal(name,'profiles');
  return {select:column=>{assert.equal(column,'is_admin');return {eq:(key,value)=>{assert.equal(key,'id');assert.equal(value,currentUser.id);return {maybeSingle:async()=>{reads++;return {data:profile,error:profileError};}};}};}};
}};
const account=load('app/auth/account.ts',{'react':{cache:fn=>fn},'../supabase/server':{serverClient:async()=>clientReady?client:null}});
assert.equal(account.enforceAdmin,true);
assert.equal((await account.getAccount()).account,null);
assert.equal(reads,0,'signed-out visitors do not query profiles');
clientReady=false;assert.equal((await account.getAccount()).problem,'configuration');clientReady=true;
currentUser={id:'00000000-0000-4000-8000-000000000001',email:'admin@example.test',user_metadata:{full_name:'A user',is_admin:true}};
profile={is_admin:false,is_superadmin:true};
assert.equal((await account.getAccount()).account.isAdmin,false,'user metadata and superadmin flag do not grant is_admin access');
profile={is_admin:'true'};assert.equal((await account.getAccount()).account.isAdmin,false,'only boolean true grants access');
profile={is_admin:true};assert.equal((await account.getAccount()).account.isAdmin,true);
profileError={code:'42703'};assert.equal((await account.getAccount()).problem,'unavailable');profileError=null;
let state={account:null,problem:null};
const access=load('app/auth/api-access.ts',{'./account':{enforceAdmin:true,getAccount:async()=>state}});
assert.equal((await access.requireAccount()).status,401);
state={account:{id:currentUser.id,isAdmin:false},problem:null};assert.equal((await access.requireAccount()).status,403);
state={account:{id:currentUser.id,isAdmin:true},problem:null};assert.equal(await access.requireAccount(),null);
assert.equal(await access.requireCloudAccess(),null,'verified admins can use cloud persistence');
state={account:{id:currentUser.id,isAdmin:false},problem:null};assert.equal((await access.requireCloudAccess()).status,403);
state={account:null,problem:null};assert.equal((await access.requireCloudAccess()).status,401);
state={account:null,problem:'configuration'};assert.equal((await access.requireAccount()).status,503);

let exchangeError=null,exchangeCount=0,verifyCount=0;
const callbackClient={auth:{exchangeCodeForSession:async code=>{assert.equal(code,'auth-code');exchangeCount++;return {error:exchangeError};},getUser:async()=>{verifyCount++;return {data:{user:currentUser},error:null};}}};
const callback=load('app/auth/callback/route.ts',{'../../supabase/server':{serverClient:async()=>callbackClient},'../return-path':redirects});
let response=await callback.GET(new Request('https://studio.example/auth/callback?code=auth-code&next=https://evil.example'));
assert.equal(response.headers.get('location'),'https://studio.example/');
assert.equal(verifyCount,1);assert.equal(response.headers.get('cache-control'),'private, no-store');
exchangeError={message:'expired'};
response=await callback.GET(new Request('https://studio.example/auth/callback?code=auth-code&next=/chains'));
assert.match(response.headers.get('location'),/^https:\/\/studio.example\/login\?/);assert.equal(verifyCount,1,'failed exchange never grants access');
response=await callback.GET(new Request('https://studio.example/auth/callback?error=access_denied'));
assert.match(response.headers.get('location'),/error=cancelled/);assert.equal(exchangeCount,2);

let signouts=0;
const signout=load('app/api/auth/signout/route.ts',{'../../../supabase/server':{serverClient:async()=>({auth:{signOut:async options=>{signouts++;assert.equal(options.scope,'local');return {error:null};}}})}});
response=await signout.POST(new Request('http://localhost/api/auth/signout',{method:'POST',headers:{origin:'https://evil.example'}}));assert.equal(response.status,403);assert.equal(signouts,0);
response=await signout.POST(new Request('http://localhost/api/auth/signout',{method:'POST',headers:{origin:'http://localhost'}}));assert.equal(response.status,200);assert.equal(signouts,1);

// SSR cookies must use the same app-specific name in browser/server/proxy clients.
for(const file of ['app/supabase/client.ts','app/supabase/server.ts','proxy.ts'])assert.match(readFileSync(new URL(file,root),'utf8'),/name:\s*authCookieName/);
assert.match(readFileSync(new URL('proxy.ts',root),'utf8'),/auth\.getClaims\(\)/);
assert.match(readFileSync(new URL('app/auth/account.ts',root),'utf8'),/auth\.getUser\(\)/);
console.log('Auth tests passed: verified sessions, exact is_admin flag, denied API access, safe OAuth callback redirects, cancellation, and local-only sign-out.');
