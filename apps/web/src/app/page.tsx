'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AuthBar } from '../components/AuthBar';
import { CatalogBrowser, type ProductItem } from '../components/CatalogBrowser';
import { ChatPurchasing } from '../components/ChatPurchasing';
import { DraftIntentPanel } from '../components/DraftIntentPanel';
import { SecurityHistoryPanel } from '../components/SecurityHistoryPanel';
import { apiFetch } from '../lib/api';
import type { UserProfile, Conversation, Message, PurchaseIntent, AuditEvent } from '@x402/shared';
import { Shield, ShieldAlert, Cpu, CheckCircle2, AlertOctagon } from 'lucide-react';

export default function Home() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // System Health
  const [healthStatus, setHealthStatus] = useState<{ live: boolean; ready: boolean } | null>(null);

  // Catalog
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  // Conversations & Messages
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Purchase Intents & History
  const [intents, setIntents] = useState<PurchaseIntent[]>([]);
  const [intentsLoading, setIntentsLoading] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // 1. Check System Health
  useEffect(() => {
    async function checkHealth() {
      try {
        const liveRes = await apiFetch<{ status: string }>('/live');
        const readyRes = await apiFetch<{ status: string; checks: { database: string } }>('/ready');
        setHealthStatus({
          live: liveRes.status === 'ok',
          ready: readyRes.status === 'ok' && readyRes.checks.database === 'healthy',
        });
      } catch {
        setHealthStatus({ live: false, ready: false });
      }
    }
    checkHealth();
  }, []);

  // 2. Load Catalog
  useEffect(() => {
    async function loadCatalog() {
      try {
        setCatalogLoading(true);
        const res = await apiFetch<{ products: ProductItem[] }>('/api/v1/catalog/products');
        setProducts(res.products || []);
      } catch (err) {
        console.error('Failed to load catalog:', err);
      } finally {
        setCatalogLoading(false);
      }
    }
    loadCatalog();
  }, []);

  // 3. Restore Auth Session
  useEffect(() => {
    const savedToken = localStorage.getItem('x402_guardian_token');
    if (savedToken) {
      setToken(savedToken);
      fetchUserProfile(savedToken);
    } else {
      // Auto-initialize with default demo user Alice for convenience
      handleLogin('alice@guardian.local', '11111111-1111-1111-1111-111111111111');
    }
  }, []);

  const fetchUserProfile = async (authToken: string) => {
    try {
      setAuthLoading(true);
      const res = await apiFetch<{ user: UserProfile }>('/api/v1/auth/me', { token: authToken });
      setUser(res.user);
    } catch {
      localStorage.removeItem('x402_guardian_token');
      setToken(null);
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (email: string, userId?: string) => {
    try {
      setAuthLoading(true);
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/v1/auth/test-token', {
        method: 'POST',
        body: JSON.stringify({ email, userId }),
      });
      setToken(res.token);
      localStorage.setItem('x402_guardian_token', res.token);
      await fetchUserProfile(res.token);
    } catch (err) {
      console.error('Authentication error:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('x402_guardian_token');
    setToken(null);
    setUser(null);
    setConversations([]);
    setActiveConv(null);
    setMessages([]);
    setIntents([]);
    setAuditEvents([]);
  };

  // 4. Load User-Scoped Data when Token or User Changes
  const loadUserData = useCallback(async () => {
    if (!token) return;

    try {
      // Conversations
      const convRes = await apiFetch<{ conversations: Conversation[] }>('/api/v1/conversations', {
        token,
      });
      setConversations(convRes.conversations || []);
      if (convRes.conversations && convRes.conversations.length > 0 && !activeConv) {
        setActiveConv(convRes.conversations[0] || null);
      }

      // Intents
      setIntentsLoading(true);
      const intentsRes = await apiFetch<{ intents: PurchaseIntent[] }>('/api/v1/purchases/intents', {
        token,
      });
      setIntents(intentsRes.intents || []);

      // History
      setHistoryLoading(true);
      const historyRes = await apiFetch<{ history: { auditEvents: AuditEvent[] } }>('/api/v1/history', {
        token,
      });
      setAuditEvents(historyRes.history?.auditEvents || []);
    } catch (err) {
      console.error('Failed to load user-scoped data:', err);
    } finally {
      setIntentsLoading(false);
      setHistoryLoading(false);
    }
  }, [token, activeConv]);

  useEffect(() => {
    if (token) {
      loadUserData();
    }
  }, [token, loadUserData]);

  // 5. Load Messages for Active Conversation
  useEffect(() => {
    async function loadMessages() {
      if (!token || !activeConv) {
        setMessages([]);
        return;
      }
      try {
        setLoadingMessages(true);
        const res = await apiFetch<{ messages: Message[] }>(
          `/api/v1/conversations/${activeConv.id}/messages`,
          { token }
        );
        setMessages(res.messages || []);
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    }
    loadMessages();
  }, [token, activeConv]);

  // Actions
  const handleCreateConversation = async (title: string) => {
    if (!token) return;
    const res = await apiFetch<{ conversation: Conversation }>('/api/v1/conversations', {
      method: 'POST',
      token,
      body: JSON.stringify({ title }),
    });
    setConversations((prev) => [res.conversation, ...prev]);
    setActiveConv(res.conversation);
    loadUserData();
  };

  const handleSendMessage = async (content: string) => {
    if (!token || !activeConv) return;
    const res = await apiFetch<{ message: Message }>(
      `/api/v1/conversations/${activeConv.id}/messages`,
      {
        method: 'POST',
        token,
        body: JSON.stringify({ role: 'user', content }),
      }
    );
    setMessages((prev) => [...prev, res.message]);
    loadUserData();
  };

  const handleDraftIntent = async (product: ProductItem) => {
    if (!token) {
      alert('Please authenticate first to create a purchase intent.');
      return;
    }
    try {
      setSelectedProduct(product);
      setStatusNotification(`Authoritatively creating draft intent for ${product.name}...`);

      const res = await apiFetch<{ intent: PurchaseIntent }>('/api/v1/purchases/intents', {
        method: 'POST',
        token,
        body: JSON.stringify({
          productId: product.id,
          conversationId: activeConv?.id,
        }),
      });

      setIntents((prev) => [res.intent, ...prev]);
      setStatusNotification(`Draft purchase intent created for ${product.name} (Amount: ${product.priceAmount} base units).`);
      setTimeout(() => setStatusNotification(null), 5000);
      loadUserData();
    } catch (err: any) {
      alert(`Error creating purchase intent: ${err?.message || err}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AuthBar
        user={user}
        token={token}
        onLogin={handleLogin}
        onLogout={handleLogout}
        loading={authLoading}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* System & Health Overview */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-surface/60 border border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-950/80 border border-blue-800/80 flex items-center justify-center text-blue-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-200">
                Phase 1 Security & Architecture Foundation
              </h2>
              <p className="text-xs text-gray-400">
                Strict boundaries between untrusted AI messages, backend catalog pricing, and immutable approvals.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800">
              <span className="text-gray-500">API Liveness:</span>
              {healthStatus?.live ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 200 OK
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <AlertOctagon className="w-3.5 h-3.5" /> Checking...
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800">
              <span className="text-gray-500">PostgreSQL DB:</span>
              {healthStatus?.ready ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <AlertOctagon className="w-3.5 h-3.5" /> Unavailable
                </span>
              )}
            </div>
          </div>
        </div>

        {statusNotification && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusNotification}</span>
          </div>
        )}

        {/* Catalog Browser */}
        <CatalogBrowser
          products={products}
          loading={catalogLoading}
          onSelectProduct={handleDraftIntent}
          selectedProductId={selectedProduct?.id}
        />

        {/* Chat & Purchasing Session */}
        <ChatPurchasing
          conversations={conversations}
          activeConversation={activeConv}
          messages={messages}
          loadingMessages={loadingMessages}
          onSelectConversation={setActiveConv}
          onCreateConversation={handleCreateConversation}
          onSendMessage={handleSendMessage}
        />

        {/* Lower Grid: Draft Intents and Security History */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DraftIntentPanel intents={intents} loading={intentsLoading} />
          <SecurityHistoryPanel
            auditEvents={auditEvents}
            simulationMode={true}
            loading={historyLoading}
          />
        </div>

        {/* Security Trust Boundaries Reference */}
        <div className="p-5 rounded-xl bg-surface/40 border border-gray-800/80 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-300 uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4 text-blue-400" />
            <span>Phase 1 Verified Trust Boundaries</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-400">
            <div className="p-3 bg-gray-950/40 rounded-lg border border-gray-900 space-y-1">
              <span className="font-semibold text-gray-200">1. Authoritative Pricing</span>
              <p>
                Product pricing and recipient addresses are sourced strictly from the backend catalog database. Client-supplied price modifications are strictly disregarded.
              </p>
            </div>
            <div className="p-3 bg-gray-950/40 rounded-lg border border-gray-900 space-y-1">
              <span className="font-semibold text-gray-200">2. Strict Tenant Isolation</span>
              <p>
                Every user-scoped operation enforces identity from verified cryptographic JWT tokens. User A cannot view, mutate, or inject messages into User B records.
              </p>
            </div>
            <div className="p-3 bg-gray-950/40 rounded-lg border border-gray-900 space-y-1">
              <span className="font-semibold text-gray-200">3. Anti-Drainer Signer Gate</span>
              <p>
                Signer interfaces refuse execution in production and never load real keys. Approval snapshots are immutable and can only be generated through authenticated approval.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
