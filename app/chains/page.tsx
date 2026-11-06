import type { Metadata } from 'next';
import Studio from './studio';
import { redirect } from 'next/navigation';
import { getAccount, enforceAdmin } from '../auth/account';
import { AccessDenied } from '../auth/access-denied';
import '../auth/auth.css';
import './studio.css';
export const metadata: Metadata = { title: 'Prompt Studio · The Humour Project', description: 'Connect a few good prompts. Make something unexpected.' };
export default async function Page() {
  const {account,problem}=await getAccount();
  if (!account) redirect(problem==='unavailable'?'/login?error=unavailable':'/login');
  if (enforceAdmin && (!account.isAdmin || problem)) return <AccessDenied email={account.email} unavailable={!!problem}/>;
  return <Studio account={{id:account.id,email:account.email}}/>;
}
