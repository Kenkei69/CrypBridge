'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Plus,
  Bot,
  User,
  ShieldAlert,
  ShoppingBag,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { SafeContentRenderer } from './SafeContentRenderer';
import { CompactApprovalCard } from './CompactApprovalCard';
import type { Message, Conversation, ApprovalPreview, Product, PaymentOption } from '@x402/shared';

interface ChatPurchasingProps {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  loadingMessages: boolean;
  onSelectConversation: (conv: Conversation) => void;
  onCreateConversation: (title: string) => Promise<void>;
  onSendMessage: (content: string) => Promise<void>;
  catalogProducts?: (Product & { paymentOptions?: PaymentOption[] })[];
  activeIntent?: any | null;
  approvalPreview?: ApprovalPreview | null;
  onSelectProduct?: (product: any) => Promise<void>;
  onSelectOption?: (optionId: string) => Promise<void>;
  onApprove?: (expectedVersion: number) => Promise<void>;
  onReject?: (reason?: string) => Promise<void>;
  approvalLoading?: boolean;
}

export function ChatPurchasing({
  conversations,
  activeConversation,
  messages,
  loadingMessages,
  onSelectConversation,
  onCreateConversation,
  onSendMessage,
  catalogProducts = [],
  activeIntent = null,
  approvalPreview = null,
  onSelectProduct,
  onSelectOption,
  onApprove,
  onReject,
  approvalLoading = false,
}: ChatPurchasingProps) {
  const [newTitle, setNewTitle] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat when new messages or cards appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, approvalPreview]);

  const handleCreateConv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      setSubmitting(true);
      await onCreateConversation(newTitle.trim());
      setNewTitle('');
      setShowNewConvModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || submitting || !activeConversation) return;
    try {
      setSubmitting(true);
      const text = inputMessage.trim();
      setInputMessage('');
      await onSendMessage(text);
    } finally {
      setSubmitting(false);
    }
  };

  const formatAmount = (baseUnits: string, decimals: number = 6) => {
    try {
      const num = Number(BigInt(baseUnits)) / 10 ** decimals;
      return `$${num.toFixed(2)}`;
    } catch {
      return `${baseUnits} units`;
    }
  };

  return (
    <div className="bg-surface/80 border border-gray-800 rounded-xl overflow-hidden shadow-lg backdrop-blur flex flex-col md:flex-row h-[680px]">
      {/* Conversations Sidebar */}
      <div className="w-full md:w-64 border-r border-gray-800 bg-gray-950/40 p-4 flex flex-col shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">
              Purchasing Sessions
            </span>
          </div>
          <button
            onClick={() => setShowNewConvModal(true)}
            className="p-1 rounded-md bg-blue-600/30 text-blue-300 hover:bg-blue-600/50 transition"
            title="Start new purchasing chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showNewConvModal && (
          <form onSubmit={handleCreateConv} className="mb-3 space-y-2">
            <input
              type="text"
              placeholder="Session title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="flex gap-1.5 justify-end">
              <button
                type="button"
                onClick={() => setShowNewConvModal(false)}
                className="px-2 py-1 text-[11px] text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-2.5 py-1 text-[11px] bg-blue-600 text-white rounded font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-500">No sessions yet.</div>
          ) : (
            conversations.map((conv) => {
              const isActive = activeConversation?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition truncate ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 font-medium'
                      : 'text-gray-400 hover:bg-gray-900/60 hover:text-gray-200 border border-transparent'
                  }`}
                >
                  {conv.title}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat & Approval Area */}
      <div className="flex-1 flex flex-col bg-surface/50 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
              <span>{activeConversation ? activeConversation.title : 'Select or Create a Session'}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/60 font-mono">
                Deterministic Catalog Grounded
              </span>
            </h3>
            <p className="text-[11px] text-gray-500">
              Untrusted Natural Language Stream | Server-Authoritative Approval Gate
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-amber-400/90 bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-900/60 font-mono">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>AI cannot grant spending authority</span>
          </div>
        </div>

        {/* Message & Approval Thread */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!activeConversation ? (
            <div className="h-full flex items-center justify-center text-gray-500 text-xs text-center px-4">
              Select an existing purchasing conversation or create a new session to begin.
            </div>
          ) : loadingMessages ? (
            <div className="h-full flex items-center justify-center text-gray-500 text-xs">
              Loading conversation messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs text-center px-4 space-y-3">
              <Sparkles className="w-8 h-8 text-blue-400 opacity-60" />
              <div>
                <strong className="text-gray-200 block text-sm">Welcome to x402 Guardian Purchasing</strong>
                <p className="max-w-md text-gray-400 mt-1">
                  Describe what resources you need (e.g. <em>&quot;I need a GPU for 1 hour under $10&quot;</em> or <em>&quot;Show security threat feeds&quot;</em>) to discover verified products and supported payment options.
                </p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const suggestedIds: string[] = (msg.metadata as any)?.suggestedProductIds || [];
                const suggestedProds = catalogProducts.filter((p) => suggestedIds.includes(p.id));

                return (
                  <div key={msg.id} className="space-y-2">
                    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                      {!isUser && (
                        <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center shrink-0 text-blue-400 mt-0.5">
                          <Bot className="w-4 h-4" />
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] rounded-xl px-4 py-3 ${
                          isUser
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-gray-900/80 border border-gray-800 text-gray-200 rounded-bl-none shadow'
                        }`}
                      >
                        <SafeContentRenderer content={msg.content} />

                        <div
                          className={`text-[10px] mt-1.5 font-mono ${
                            isUser ? 'text-blue-200/70 text-right' : 'text-gray-500'
                          }`}
                        >
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>

                      {isUser && (
                        <div className="w-7 h-7 rounded-full bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-400 mt-0.5">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Render Interactive Suggested Product Cards if Assistant attached them */}
                    {!isUser && suggestedProds.length > 0 && (
                      <div className="ml-10 grid grid-cols-1 md:grid-cols-2 gap-2.5 my-2">
                        {suggestedProds.map((prod) => (
                          <div
                            key={prod.id}
                            data-testid={`suggested-product-${prod.id}`}
                            className="p-3 bg-gray-900/90 border border-blue-900/50 rounded-lg flex flex-col justify-between hover:border-blue-500/80 transition"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-1.5">
                                <h5 className="font-semibold text-xs text-gray-100">{prod.name}</h5>
                                <span className="font-mono text-xs font-bold text-emerald-400 shrink-0">
                                  {formatAmount(prod.priceAmount)} {prod.currency}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400 line-clamp-2 my-1.5">
                                {prod.description}
                              </p>
                              <div className="text-[10px] text-gray-500 font-mono">
                                Merchant: {prod.merchant?.name || 'Verified Merchant'}
                              </div>
                            </div>

                            <div className="pt-2 mt-2 border-t border-gray-800/80 flex items-center justify-between">
                              <span className="text-[10px] font-mono text-blue-400">
                                {prod.paymentOptions?.length || 1} payment option(s)
                              </span>
                              {onSelectProduct && (
                                <button
                                  type="button"
                                  data-testid={`select-product-${prod.id}`}
                                  onClick={() => onSelectProduct(prod)}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-medium flex items-center gap-1 transition shadow"
                                >
                                  <span>Select</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Render Active Intent's Compact Approval Card if present */}
              {approvalPreview && onApprove && onReject && onSelectOption && (
                <div className="my-4">
                  <CompactApprovalCard
                    preview={approvalPreview}
                    loading={approvalLoading}
                    onApprove={onApprove}
                    onReject={onReject}
                    onSelectOption={onSelectOption}
                  />
                </div>
              )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Message Composer */}
        <form onSubmit={handleSend} className="p-3 border-t border-gray-800 bg-gray-950/60 flex gap-2 shrink-0">
          <input
            type="text"
            disabled={!activeConversation || submitting}
            placeholder={
              activeConversation
                ? 'Ask about GPU compute, inference credits, or select items...'
                : 'Select a conversation first'
            }
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3.5 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!activeConversation || !inputMessage.trim() || submitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{submitting ? 'Sending...' : 'Send'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
