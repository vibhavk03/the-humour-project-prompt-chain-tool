import { AccountControls } from './account-controls';
import './auth.css';
export function AccessDenied({email,unavailable=false}:{email:string;unavailable?:boolean}) {
  return <main className="ps auth-page" data-theme="system"><section className="auth-card auth-denied"><div className="auth-mark" aria-hidden="true">✧</div><span className="ps-eyebrow">PROMPT STUDIO</span><h1>{unavailable?'Access could not be verified.':'Admin access required.'}</h1><p>{unavailable?'The profile permission check is unavailable. Confirm that your profiles table has an is_admin field readable by your account, then retry.':'You have signed in successfully. This tool is available only to accounts with profiles.is_admin set to true. Ask your project administrator for access.'}</p><AccountControls email={email}/><form action="/" method="get"><button type="submit" className="auth-retry">Retry access check ↗</button></form></section></main>;
}
