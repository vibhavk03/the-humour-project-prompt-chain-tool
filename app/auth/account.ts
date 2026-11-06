import 'server-only';
import { cache } from 'react';
import { serverClient } from '../supabase/server';
export type Account={id:string;email:string;name:string;isAdmin:boolean};
export type AccountState={account:Account|null;problem:'configuration'|'unavailable'|null};
// Access requires the database's is_admin flag, as requested.
export const enforceAdmin = true;
export const getAccount=cache(async ():Promise<AccountState>=>{
  const client=await serverClient();
  if (!client) return {account:null,problem:'configuration'};
  try {
    const {data:{user},error}=await client.auth.getUser();
    if (error || !user) return {account:null,problem:error && !['AuthSessionMissingError','AuthApiError'].includes(error.name)?'unavailable':null};
    let isAdmin=false;
    if (enforceAdmin) {
      const {data,error:profileError}=await client.from('profiles').select('is_admin').eq('id',user.id).maybeSingle();
      // Never infer admin privileges from Google/user metadata or a missing profile.
      if (profileError) return {account:{id:user.id,email:user.email ?? '',name:user.email?.split('@')[0] || 'Your account',isAdmin:false},problem:'unavailable'};
      isAdmin=data?.is_admin===true;
    }
    return {account:{id:user.id,email:user.email ?? '',name:String(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Your account').slice(0,100),isAdmin},problem:null};
  } catch {return {account:null,problem:'unavailable'};}
});
