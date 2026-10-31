'use client';
import React, { useState } from 'react';
import type { UserProfile } from '@x402/shared';
import { sendCode } from '../lib/auth';
interface AuthBarProps {
  user: UserProfile | null;
  token: string | null;
  onLogin: (email: string, code?: string) => Promise<void>;
  onLogout: () => void;
  loading: boolean;
}
export function AuthBar({ user, token, onLogin, onLogout, loading }: AuthBarProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (!sent) { await sendCode(email); setSent(true); }
      else await onLogin(email, code);
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed'); }
    finally { setBusy(false); }
  }
  return <header className="border-b border-gray-800 bg-surface px-6 py-4">
    <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-4">
      <div><h1 className="font-bold">CrypBridge</h1><p className="text-xs text-amber-300">Simulation demo · No real funds transferred</p></div>
      {user && token ? <div className="flex gap-4 items-center"><span>{user.email}</span><button onClick={onLogout}>Sign out</button></div> :
      <form onSubmit={submit} className="flex flex-wrap gap-2 items-center">
        <label className="sr-only" htmlFor="login-email">Email</label>
        <input id="login-email" type="email" required value={email} disabled={sent} onChange={event => setEmail(event.target.value)} placeholder="Invited email address" className="bg-gray-900 border border-gray-700 rounded px-3 py-2" />
        {sent && <><label className="sr-only" htmlFor="login-code">Email code</label><input id="login-code" required autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} placeholder="Code from email" className="bg-gray-900 border border-gray-700 rounded px-3 py-2" /></>}
        <button disabled={busy || loading} className="bg-blue-600 rounded px-4 py-2 disabled:opacity-50">{busy || loading ? 'Please wait…' : sent ? 'Verify code' : 'Send sign-in link'}</button>
        {sent && <button type="button" onClick={() => {setSent(false);setCode('');}}>Change email</button>}
        {sent && <p role="status" className="text-xs text-gray-300 w-full">Open the sign-in link in your email in this browser. If your email contains a code, enter it here.</p>}
        {error && <p role="alert" className="text-red-300 w-full">{error}</p>}
      </form>}
    </div>
  </header>;
}
