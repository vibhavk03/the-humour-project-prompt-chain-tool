import { enforceAdmin, getAccount } from './account';
export async function requireAccount():Promise<Response|null> {
  const {account,problem}=await getAccount();
  if (problem) return Response.json({error:problem==='configuration'?'Supabase sign-in is not configured.':'Could not verify your account. Please try again.'},{status:503});
  if (!account) return Response.json({error:'Sign in with Google to continue.'},{status:401});
  if (enforceAdmin && !account.isAdmin) return Response.json({error:'This workspace requires admin access.'},{status:403});
  return null;
}
export async function requireCloudAccess():Promise<Response|null> {
  const blocked=await requireAccount();
  if (blocked) return blocked;
  return Response.json({error:'Cloud storage is paused while sign-in is being verified. Chains are saved in this browser. The authenticated database migration comes next.'},{status:503});
}
