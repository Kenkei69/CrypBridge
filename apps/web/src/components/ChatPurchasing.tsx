'use client';

import React, { useState } from 'react';
import { MessageSquare, Send, Plus, Bot, User, ShieldAlert } from 'lucide-react';
import { SafeContentRenderer } from './SafeContentRenderer';
import type { Message, Conversation } from '@x402/shared';

interface ChatPurchasingProps {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  loadingMessages: boolean;
  onSelectConversation: (conv: Conversation) => void;
  onCreateConversation: (title: string) => Promise<void>;
  onSendMessage: (content: string) => Promise<void>;
}

export function ChatPurchasing({
  conversations,
  activeConversation,
  messages,
  loadingMessages,
  onSelectConversation,
  onCreateConversation,
  onSendMessage,
}: ChatPurchasingProps) {
  const [newTitle, setNewTitle] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showNewConvModal, setShowNewConvModal] = useState(false);

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
      await onSendMessage(inputMessage.trim());
      setInputMessage('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface/80 border border-gray-800 rounded-xl overflow-hidden shadow-lg backdrop-blur flex flex-col md:flex-row h-[560px]">
      {/* Conversations Sidebar */}
      <div className="w-full md:w-64 border-r border-gray-800 bg-gray-950/40 p-4 flex flex-col">
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

      {/* Chat Messages and Input */}
      <div className="flex-1 flex flex-col bg-surface/50">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-200">
              {activeConversation ? activeConversation.title : 'Select or Create a Session'}
            </h3>
            <p className="text-[11px] text-gray-500">
              Untrusted Chat Stream | Server Authoritative Boundaries
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-amber-400/90 bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-900/60 font-mono">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>AI cannot grant spending authority</span>
          </div>
        </div>

        {/* Message Thread */}
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
            <div className="h-full flex items-center justify-center text-gray-500 text-xs text-center px-4">
              Start by typing a purchasing request or selecting an item from the verified catalog.
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center shrink-0 text-blue-400">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-3 ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-gray-900/80 border border-gray-800 text-gray-200 rounded-bl-none'
                    }`}
                  >
                    <SafeContentRenderer content={msg.content} />
                    <div
                      className={`text-[10px] mt-1.5 font-mono ${
                        isUser ? 'text-blue-200/70 text-right' : 'text-gray-500'
                      }`}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {isUser && (
                    <div className="w-7 h-7 rounded-full bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-400">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Input Composer */}
        <form onSubmit={handleSend} className="p-3 border-t border-gray-800 bg-gray-950/60 flex gap-2">
          <input
            type="text"
            disabled={!activeConversation || submitting}
            placeholder={
              activeConversation
                ? 'Type message to purchasing assistant...'
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
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
