'use client';
import { createBrowserClient } from '@supabase/ssr';
import { authConfig, authCookieName } from './config';
export function browserClient() {
  const config = authConfig();
  if (!config) throw new Error('Add the Supabase project URL and publishable key to .env.local, then restart the server.');
  return createBrowserClient(config.url, config.key, { cookieOptions: { name:authCookieName, path:'/', sameSite:'lax' } });
}
