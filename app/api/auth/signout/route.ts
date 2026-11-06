import { serverClient } from '../../../supabase/server';
export async function POST(request: Request) {
  const origin=request.headers.get('origin');
  if (origin && origin!==new URL(request.url).origin) return Response.json({error:'Cross-origin sign-out is not allowed.'},{status:403});
  const client=await serverClient();
  if (!client) return Response.json({error:'Sign-in is not configured.'},{status:503});
  try {
    // Only sign out this app/session; do not revoke the user's other projects.
    const {error}=await client.auth.signOut({scope:'local'});
    if (error) return Response.json({error:'Could not sign out. Please try again.'},{status:502});
    return Response.json({signedOut:true},{headers:{'Cache-Control':'no-store'}});
  } catch {return Response.json({error:'Could not sign out. Please try again.'},{status:502});}
}
