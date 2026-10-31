'use client';

import React, { useState } from 'react';
import { User, LogIn, LogOut, Key, Shield } from 'lucide-react';
import type { UserProfile } from '@x402/shared';

interface AuthBarProps {
  user: UserProfile | null;
  token: string | null;
  onLogin: (email: string, userId?: string) => Promise<void>;
  onLogout: () => void;
  loading: boolean;
}

export function AuthBar({ user, token, onLogin, onLogout, loading }: AuthBarProps) {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [emailInput, setEmailInput] = useState('user.alice@guardian.local');
  const [customUserId, setCustomUserId] = useState('11111111-1111-1111-1111-111111111111');

  const handleQuickLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    await onLogin(emailInput, customUserId || undefined);
    setShowLoginModal(false);
  };

  const switchToUser = async (email: string, id: string) => {
    await onLogin(email, id);
  };

  return (
    <header className="border-b border-gray-800 bg-surface/90 backdrop-blur sticky top-0 z-50 px-6 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-blue-500/20">
            x
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              x402 Guardian
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-800/60 uppercase font-semibold">
                Phase 1 Foundation
              </span>
            </h1>
            <p className="text-[11px] text-gray-400">Payment Authorization & Drain Protection Gate</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {token && user ? (
            <div className="flex items-center gap-3">
              {/* User Switcher for Isolation Demos */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs bg-gray-900 border border-gray-800 rounded-lg p-1">
                <span className="text-[11px] text-gray-500 px-2">Switch:</span>
                <button
                  onClick={() => switchToUser('alice@test.local', '11111111-1111-1111-1111-111111111111')}
                  className={`px-2 py-1 rounded text-[11px] font-mono transition ${
                    user.email.includes('alice')
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Alice
                </button>
                <button
                  onClick={() => switchToUser('bob@test.local', '22222222-2222-2222-2222-222222222222')}
                  className={`px-2 py-1 rounded text-[11px] font-mono transition ${
                    user.email.includes('bob')
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Bob
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs bg-gray-900/80 border border-gray-800 px-3 py-1.5 rounded-lg">
                <User className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="font-medium text-gray-200">{user.displayName || user.email}</div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    ID: {user.id.substring(0, 8)}...
                  </div>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="p-2 text-gray-400 hover:text-red-400 transition"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition shadow-md shadow-blue-600/20"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In / Demo Identity</span>
            </button>
          )}
        </div>
      </div>

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-gray-800 mb-4">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm text-gray-100">Authenticate Session</h3>
              </div>
              <button
                onClick={() => setShowLoginModal(false)}
                className="text-gray-400 hover:text-gray-200 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Email Address</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-gray-900 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  User ID (UUID - cryptographic subject)
                </label>
                <input
                  type="text"
                  value={customUserId}
                  onChange={(e) => setCustomUserId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-gray-900 border border-gray-700 rounded-lg text-gray-100 font-mono text-[11px] focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Issues a signed Supabase-compatible HMAC-SHA256 JWT for session restoration.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium"
                >
                  {loading ? 'Authenticating...' : 'Sign In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
