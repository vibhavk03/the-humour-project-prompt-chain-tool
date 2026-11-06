import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authConfig, authCookieName } from './app/supabase/config';
export async function proxy(request: NextRequest) {
  const config=authConfig();
  let response=NextResponse.next({request});
  if (!config) return response;
  const supabase=createServerClient(config.url,config.key,{
    cookieOptions:{name:authCookieName,path:'/',sameSite:'lax'},
    cookies:{
      getAll:()=>request.cookies.getAll(),
      setAll(values){
        for (const {name,value} of values) request.cookies.set(name,value);
        response=NextResponse.next({request});
        for (const {name,value,options} of values) response.cookies.set(name,value,options);
      },
    },
  });
  // Refresh cookie-backed sessions. Route/page guards independently verify access.
  try { await supabase.auth.getClaims(); } catch { /* Route guards show a safe sign-in error. */ }
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config={matcher:['/','/chains/:path*','/login','/api/:path*']};
