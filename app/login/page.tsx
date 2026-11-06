import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAccount, enforceAdmin } from '../auth/account';
import { AccountControls } from '../auth/account-controls';
import { authConfig } from '../supabase/config';
import { loginError, returnPath } from '../auth/return-path';
import { GoogleSignIn } from './google-sign-in';
import '../chains/studio.css';
import '../auth/auth.css';
export const metadata:Metadata={title:'Sign in · Prompt Studio'};
export default async function Login({searchParams}:{searchParams:Promise<{next?:string;error?:string}>}) {
  const params=await searchParams;
  const {account,problem}=await getAccount();
  if (account && !problem && (!enforceAdmin||account.isAdmin)) redirect(returnPath(params.next));
  const configured=!!authConfig();
  const denied=!!account && enforceAdmin && !account.isAdmin;
  const message=loginError(params.error) || (problem==='unavailable'?'We could not verify account access. Please try again in a moment.':'');
  return <main className="ps auth-page" data-theme="system"><div className="auth-top"><span className="ps-brand">prompt<span>studio</span><span className="ps-beta">BETA</span></span><span className="auth-project">THE HUMOUR PROJECT</span></div><section className="auth-layout"><div className="auth-story"><span className="ps-eyebrow">A LITTLE DIRECTION. A LOT OF POSSIBILITY.</span><h1>Your ideas.<br/><span>In good company.</span></h1><p>Connect a few thoughtful prompts.<br/>Make something you didn’t see coming.</p><div className="auth-recipe"><span className="auth-recipe-number">01</span><span>Start with a little idea</span><span>↘</span></div><div className="auth-recipe"><span className="auth-recipe-number">02</span><span>Find an unexpected angle</span><span>↘</span></div><div className="auth-recipe"><span className="auth-recipe-number">03</span><span>Make it worth sharing</span><span>✧</span></div></div><div className="auth-card"><div className="auth-mark" aria-hidden="true">✧</div><span className="ps-eyebrow">YOUR CREATIVE WORKSPACE</span><h2>{denied?'You’re signed in.':'Good ideas start here.'}</h2><p>{denied?'This workspace is reserved for admins. Ask the project administrator to grant access to your account.':'Sign in to build prompt chains and turn a starting thought into something unexpected.'}</p>{!configured&&<p className="auth-error" role="alert">Sign-in needs the Supabase URL and publishable key in .env.local. Restart the app after adding them.</p>}{message&&<p className="auth-error" role="alert">{message}</p>}{denied?<AccountControls email={account.email}/>:<GoogleSignIn next={returnPath(params.next)} configured={configured}/>}<div className="auth-card-footer"><span className="ps-status-dot"/><span>One account. Room for all your ideas.</span></div></div></section><footer className="auth-footer">Made for the space between “what if” and “there it is.”</footer></main>;
}
