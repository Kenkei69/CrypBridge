'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AuthBar } from '../components/AuthBar';
import { CatalogBrowser, type ProductItem } from '../components/CatalogBrowser';
import { ChatPurchasing } from '../components/ChatPurchasing';
import { DraftIntentPanel } from '../components/DraftIntentPanel';
import { SecurityHistoryPanel } from '../components/SecurityHistoryPanel';
import { apiFetch } from '../lib/api';
import type {
  UserProfile,
  Conversation,
  Message,
  PurchaseIntent,
  AuditEvent,
  ApprovalPreview,
} from '@x402/shared';
import { Shield, ShieldAlert, CheckCircle2, AlertOctagon } from 'lucide-react';

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

  // Phase 2 Purchase Intent & Approval State
  const [intents, setIntents] = useState<PurchaseIntent[]>([]);
  const [intentsLoading, setIntentsLoading] = useState(false);
  const [activeIntent, setActiveIntent] = useState<PurchaseIntent | null>(null);
  const [approvalPreview, setApprovalPreview] = useState<ApprovalPreview | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);

  // Security History
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
    localStorage.removeItem('x402_active_conv_id');
    setToken(null);
    setUser(null);
    setConversations([]);
    setActiveConv(null);
    setMessages([]);
    setIntents([]);
    setActiveIntent(null);
    setApprovalPreview(null);
    setAuditEvents([]);
  };

  // 4. Fetch Approval Preview for an Intent
  const fetchApprovalPreview = useCallback(
    async (intentId: string) => {
      if (!token) return;
      try {
        const res = await apiFetch<{ preview: ApprovalPreview }>(
          `/api/v1/purchases/intents/${intentId}/preview`,
          { token }
        );
        setApprovalPreview(res.preview);
      } catch (err) {
        console.error('Failed to load approval preview:', err);
      }
    },
    [token]
  );

  // 5. Load User-Scoped Data when Token or ActiveConv Changes
  const loadUserData = useCallback(async () => {
    if (!token) return;

    try {
      // Conversations
      const convRes = await apiFetch<{ conversations: Conversation[] }>('/api/v1/conversations', {
        token,
      });
      const convList = convRes.conversations || [];
      setConversations(convList);

      const savedConvId = localStorage.getItem('x402_active_conv_id');
      if (!activeConv && convList.length > 0) {
        const matched = convList.find((c) => c.id === savedConvId) || convList[0];
        setActiveConv(matched || null);
      }

      // Intents
      setIntentsLoading(true);
      const intentsRes = await apiFetch<{ intents: PurchaseIntent[] }>('/api/v1/purchases/intents', {
        token,
      });
      const intentList = intentsRes.intents || [];
      setIntents(intentList);

      // Match intent to active conversation
      const currentConvId = activeConv?.id || savedConvId;
      const convIntent = intentList.find((i) => i.conversationId === currentConvId) || intentList[0];
      if (convIntent) {
        setActiveIntent(convIntent);
        await fetchApprovalPreview(convIntent.id);
      } else {
        setActiveIntent(null);
        setApprovalPreview(null);
      }

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
  }, [token, activeConv, fetchApprovalPreview]);

  useEffect(() => {
    if (token) {
      loadUserData();
    }
  }, [token, loadUserData]);

  // 6. Load Messages for Active Conversation
  useEffect(() => {
    async function loadMessages() {
      if (!token || !activeConv) {
        setMessages([]);
        return;
      }
      try {
        setLoadingMessages(true);
        localStorage.setItem('x402_active_conv_id', activeConv.id);
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
    localStorage.setItem('x402_active_conv_id', res.conversation.id);
    setActiveIntent(null);
    setApprovalPreview(null);
  };

  const handleSelectConversation = (conv: Conversation) => {
    setActiveConv(conv);
    localStorage.setItem('x402_active_conv_id', conv.id);
    const convIntent = intents.find((i) => i.conversationId === conv.id);
    if (convIntent) {
      setActiveIntent(convIntent);
      fetchApprovalPreview(convIntent.id);
    } else {
      setActiveIntent(null);
      setApprovalPreview(null);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!token || !activeConv) return;

    try {
      // 1. Post user message
      const res = await apiFetch<{ message: Message }>(
        `/api/v1/conversations/${activeConv.id}/messages`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({ role: 'user', content }),
        }
      );
      setMessages((prev) => [...prev, res.message]);

      // 2. Request assistant reply with catalog grounding
      const assistantRes = await apiFetch<{
        message: Message;
        suggestedProducts: ProductItem[];
        selectedProductId?: string;
      }>(`/api/v1/conversations/${activeConv.id}/assistant-reply`, {
        method: 'POST',
        token,
        body: JSON.stringify({}),
      });

      setMessages((prev) => [...prev, assistantRes.message]);

      // If user requested reference selection (e.g. "the first one"), auto-select that product
      if (assistantRes.selectedProductId) {
        const prod = products.find((p) => p.id === assistantRes.selectedProductId);
        if (prod) {
          await handleSelectProduct(prod);
        }
      }

      loadUserData();
    } catch (err: any) {
      console.error('Message delivery error:', err);
      setStatusNotification(`Error sending message: ${err?.message || err}`);
    }
  };

  const handleSelectProduct = async (product: ProductItem) => {
    if (!token) {
      alert('Please authenticate first to select a product.');
      return;
    }
    try {
      setApprovalLoading(true);
      setSelectedProduct(product);
      setStatusNotification(`Creating purchase intent for ${product.name}...`);

      const res = await apiFetch<{ intent: PurchaseIntent }>('/api/v1/purchases/intents', {
        method: 'POST',
        token,
        body: JSON.stringify({
          productId: product.id,
          conversationId: activeConv?.id,
        }),
      });

      setActiveIntent(res.intent);
      setIntents((prev) => [res.intent, ...prev.filter((i) => i.id !== res.intent.id)]);
      await fetchApprovalPreview(res.intent.id);

      setStatusNotification(`Purchase intent created for ${product.name}. Please select payment option and review approval card.`);
      setTimeout(() => setStatusNotification(null), 5000);
      loadUserData();
    } catch (err: any) {
      alert(`Error creating purchase intent: ${err?.message || err}`);
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleSelectOption = async (optionId: string) => {
    if (!token || !activeIntent) return;
    try {
      setApprovalLoading(true);
      const res = await apiFetch<{ intent: PurchaseIntent }>(
        `/api/v1/purchases/intents/${activeIntent.id}/option`,
        {
          method: 'PATCH',
          token,
          body: JSON.stringify({ paymentOptionId: optionId }),
        }
      );

      setActiveIntent(res.intent);
      await fetchApprovalPreview(activeIntent.id);
      setStatusNotification('Payment option updated. Terms refreshed with optimistic version lock.');
      setTimeout(() => setStatusNotification(null), 4000);
      loadUserData();
    } catch (err: any) {
      alert(`Error updating payment option: ${err?.message || err}`);
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleApprove = async (expectedVersion: number) => {
    if (!token || !activeIntent) return;
    try {
      setApprovalLoading(true);
      const res = await apiFetch<{
        status: string;
        message: string;
        snapshot: any;
      }>(`/api/v1/purchases/intents/${activeIntent.id}/approve`, {
        method: 'POST',
        token,
        body: JSON.stringify({ expectedVersion }),
      });

      setStatusNotification(res.message);
      await fetchApprovalPreview(activeIntent.id);
      loadUserData();
    } catch (err: any) {
      alert(`Approval error: ${err?.message || err}`);
      await fetchApprovalPreview(activeIntent.id);
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleReject = async (reason?: string) => {
    if (!token || !activeIntent) return;
    try {
      setApprovalLoading(true);
      await apiFetch<{ status: string }>(
        `/api/v1/purchases/intents/${activeIntent.id}/reject`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({ reason }),
        }
      );

      setStatusNotification('Purchase intent rejected.');
      await fetchApprovalPreview(activeIntent.id);
      loadUserData();
    } catch (err: any) {
      alert(`Rejection error: ${err?.message || err}`);
    } finally {
      setApprovalLoading(false);
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
                x402 Guardian — Phase 2 AI Purchasing & Authorization Gate
              </h2>
              <p className="text-xs text-gray-400">
                Catalog-grounded purchasing chat with backend-authoritative terms and immutable user approval snapshots.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800">
              <span className="text-gray-500">API:</span>
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
          <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-lg text-emerald-300 text-xs flex items-center gap-2 shadow">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusNotification}</span>
          </div>
        )}

        {/* Catalog Browser */}
        <CatalogBrowser
          products={products}
          loading={catalogLoading}
          onSelectProduct={handleSelectProduct}
          selectedProductId={selectedProduct?.id}
        />

        {/* Phase 2 Interactive Purchasing Chat & Compact Approval Card */}
        <ChatPurchasing
          conversations={conversations}
          activeConversation={activeConv}
          messages={messages}
          loadingMessages={loadingMessages}
          onSelectConversation={handleSelectConversation}
          onCreateConversation={handleCreateConversation}
          onSendMessage={handleSendMessage}
          catalogProducts={products as any}
          activeIntent={activeIntent}
          approvalPreview={approvalPreview}
          onSelectProduct={handleSelectProduct}
          onSelectOption={handleSelectOption}
          onApprove={handleApprove}
          onReject={handleReject}
          approvalLoading={approvalLoading}
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

        {/* Phase 2 Security Trust Boundaries Reference */}
        <div className="p-5 rounded-xl bg-surface/40 border border-gray-800/80 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-300 uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4 text-blue-400" />
            <span>Phase 2 Verified Trust Boundaries</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-400">
            <div className="p-3 bg-gray-950/40 rounded-lg border border-gray-900 space-y-1">
              <span className="font-semibold text-gray-200">1. AI Language Separation</span>
              <p>
                Natural language generation cannot set prices, alter recipient addresses, or approve transactions. Model output is treated as untrusted suggestions.
              </p>
            </div>
            <div className="p-3 bg-gray-950/40 rounded-lg border border-gray-900 space-y-1">
              <span className="font-semibold text-gray-200">2. Authoritative Payment Options</span>
              <p>
                Asset, network, and base-unit amounts are bound to backend catalog records. Switching payment options increments version and invalidates earlier approvals.
              </p>
            </div>
            <div className="p-3 bg-gray-950/40 rounded-lg border border-gray-900 space-y-1">
              <span className="font-semibold text-gray-200">3. Immutable Approval Snapshot</span>
              <p>
                Explicit user approval creates one immutable snapshot bound to the exact intent version. Phase 2 stops at approval; payment execution and signing remain disabled.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
