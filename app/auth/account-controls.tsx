'use client';
import { useState } from 'react';
export function AccountControls({email,disabled=false,hasUnsavedChanges=false}:{email:string;disabled?:boolean;hasUnsavedChanges?:boolean}) {
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  async function signOut() {
    if (hasUnsavedChanges && !window.confirm('Sign out and discard your unsaved changes?')) return;
    setWorking(true);setError('');
    try {
      const response=await fetch('/api/auth/signout',{method:'POST'});
      if (!response.ok) throw new Error('Sign-out failed. Please try again.');
      window.location.replace('/login');
    } catch(e) {setError((e as Error).message);setWorking(false);}
  }
  return <div className="auth-account"><span className="auth-avatar" aria-hidden="true">{email.slice(0,1).toUpperCase() || 'U'}</span><span className="auth-email" title={email}>{email}</span><button className="auth-signout" disabled={working||disabled} onClick={signOut}>{working?'Signing out…':'Sign out'}</button>{error&&<span role="alert" className="auth-account-error">{error}</span>}</div>;
}
