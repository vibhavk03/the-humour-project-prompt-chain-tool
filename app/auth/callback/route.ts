import { NextResponse, type NextRequest } from 'next/server';
import { serverClient } from '../../supabase/server';
import { returnPath } from '../return-path';
export async function GET(request: NextRequest) {
  const url=new URL(request.url);
  const destination=returnPath(url.searchParams.get('next'));
  const client=await serverClient();
  let error='callback';
  if (url.searchParams.has('error')) error='cancelled';
  else if (client && url.searchParams.get('code')) {
    try {
      const {error:exchangeError}=await client.auth.exchangeCodeForSession(url.searchParams.get('code')!);
      if (!exchangeError) {
        const {data:{user},error:verifyError}=await client.auth.getUser();
        if (user && !verifyError) {
          const response=NextResponse.redirect(new URL(destination,url.origin));
          response.headers.set('Cache-Control','private, no-store');
          return response;
        }
      }
    } catch {error='unavailable';}
  }
  const target=new URL('/login',url.origin);
  target.searchParams.set('error',error);
  target.searchParams.set('next',destination);
  const response=NextResponse.redirect(target);
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
