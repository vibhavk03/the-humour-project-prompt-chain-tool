import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authConfig, authCookieName } from './config';
export async function serverClient() {
  const config = authConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions:{name:authCookieName,path:'/',sameSite:'lax'},
    cookies: {
      getAll:()=>store.getAll(),
      setAll(values) {
        try { for (const {name,value,options} of values) store.set(name,value,options); }
        catch { /* Server Components cannot write cookies; proxy handles refresh. */ }
      },
    },
  });
}
