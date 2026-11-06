'use client';
import { useState } from 'react';
import { browserClient } from '../supabase/client';
import { returnPath } from '../auth/return-path';
export function GoogleSignIn({next,configured}:{next:string;configured:boolean}) {
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  async function signIn() {
    if (loading) return;
    setLoading(true);setError('');
    try {
      const callback=new URL('/auth/callback',window.location.origin);
      callback.searchParams.set('next',returnPath(next));
      const {error}=await browserClient().auth.signInWithOAuth({provider:'google',options:{redirectTo:callback.toString(),queryParams:{prompt:'select_account'}}});
      if (error) throw new Error('Google sign-in could not start. Check that Google is enabled in Supabase and this app URL is allowed, then try again.');
    } catch(e) {setError((e as Error).message);setLoading(false);}
  }
  return <><button className="auth-google" disabled={!configured||loading} onClick={signIn}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.3 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.9-1.8-5.7-4.2H2.9v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.3 13.9a6 6 0 0 1 0-3.8V7.5H2.9a10 10 0 0 0 0 9l3.4-2.6Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9.1 5.5l3.4 2.6C7.1 7.7 9.4 5.9 12 5.9Z"/></svg>{loading?'Taking you to Google…':'Continue with Google'}<span aria-hidden="true">↗</span></button>{error&&<p className="auth-error" role="alert">{error}</p>}</>;
}
