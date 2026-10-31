'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Copy,
  ExternalLink,
  ChevronDown,
  Layers,
} from 'lucide-react';
import type { ApprovalPreview, PaymentOption } from '@x402/shared';

interface CompactApprovalCardProps {
  preview: ApprovalPreview;
  loading: boolean;
  onApprove: (expectedVersion: number) => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onSelectOption: (optionId: string) => Promise<void>;
}

export function CompactApprovalCard({
  preview,
  loading,
  onApprove,
  onReject,
  onSelectOption,
}: CompactApprovalCardProps) {
  const [copied, setCopied] = useState(false);
  const [showFullAddress, setShowFullAddress] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const handleCopy = () => {
    if (preview.trustedRecipientAddress) {
      navigator.clipboard.writeText(preview.trustedRecipientAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isApproved = preview.status === 'approved';
  const isRejected = preview.status === 'rejected';
  const isExpired = preview.isExpired || preview.status === 'expired';
  const isSuperseded = preview.status === 'superseded';
  const canApprove = preview.canApprove && !isApproved && !isRejected && !isExpired;

  return (
    <div
      data-testid="compact-approval-card"
      className="bg-gray-950/90 border border-gray-800 rounded-xl overflow-hidden shadow-xl backdrop-blur my-3"
    >
      {/* Top Header Bar */}
      <div className="px-4 py-2.5 bg-gray-900/90 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold tracking-wide text-gray-200 uppercase">
            Purchase Approval Card
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60">
            v{preview.version}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isApproved && (
            <span
              data-testid="status-badge-approved"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 flex items-center gap-1 font-semibold"
            >
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              Approved
            </span>
          )}
          {isRejected && (
            <span
              data-testid="status-badge-rejected"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/80 flex items-center gap-1 font-semibold"
            >
              <XCircle className="w-3 h-3 text-rose-400" />
              Rejected
            </span>
          )}
          {isExpired && !isApproved && !isRejected && (
            <span
              data-testid="status-badge-expired"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/80 flex items-center gap-1 font-semibold"
            >
              <Clock className="w-3 h-3 text-amber-400" />
              Expired
            </span>
          )}
          {!isApproved && !isRejected && !isExpired && (
            <span
              data-testid="status-badge-pending"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-700/80 flex items-center gap-1 font-semibold"
            >
              <Clock className="w-3 h-3 text-blue-400" />
              Pending Approval
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3.5 text-xs">
        {/* Product & Merchant Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-100">{preview.productName}</h4>
            <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
              <span>Merchant:</span>
              <span className="text-gray-200 font-medium">{preview.merchantName}</span>
              <span className="text-[10px] text-amber-400/80 bg-amber-950/40 px-1.5 py-0.2 rounded border border-amber-900/40">
                (Demonstration Catalog)
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-base font-bold font-mono text-emerald-400">
              {preview.displayAmount} {preview.currency}
            </div>
            <div className="text-[10px] font-mono text-gray-500">
              {preview.amount} base units
            </div>
          </div>
        </div>

        {/* Payment Option Selector */}
        {preview.availablePaymentOptions && preview.availablePaymentOptions.length > 0 && (
          <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-400 font-medium flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                Select Supported Payment Option:
              </span>
              <span className="text-gray-500 font-mono text-[10px]">
                {preview.availablePaymentOptions.length} option(s) configured
              </span>
            </div>

            <div className="space-y-1">
              {preview.availablePaymentOptions.map((opt) => {
                const isSelected = opt.id === preview.paymentOptionId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={loading || isApproved || isRejected}
                    onClick={() => onSelectOption(opt.id)}
                    className={`w-full text-left p-2 rounded-md transition text-[11px] flex items-center justify-between border ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500/60 text-blue-200 font-medium'
                        : 'bg-gray-950/40 border-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-900/80'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isSelected ? 'bg-blue-400' : 'bg-gray-600'
                        }`}
                      />
                      <span>
                        <strong className="text-gray-200 font-mono">{opt.networkIdentifier}</strong> •{' '}
                        {opt.assetIdentifier}
                      </span>
                      {opt.isDefault && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-gray-800 text-gray-300 uppercase">
                          Default
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-emerald-400 font-semibold">
                      ${(Number(BigInt(opt.amount)) / 10 ** opt.decimals).toFixed(2)} {opt.currency}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Server-Authoritative Terms Grid */}
        <div className="grid grid-cols-2 gap-2 p-2.5 bg-gray-900/40 rounded-lg border border-gray-800/60 font-mono text-[11px]">
          <div>
            <span className="text-gray-500">Asset Identifier:</span>{' '}
            <span className="text-gray-300 font-semibold">{preview.assetIdentifier}</span>
          </div>
          <div>
            <span className="text-gray-500">Network:</span>{' '}
            <span className="text-gray-300 font-semibold truncate block">
              {preview.networkIdentifier}
            </span>
          </div>

          <div className="col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Trusted Recipient:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowFullAddress(!showFullAddress)}
                  className="text-[10px] text-blue-400 hover:underline"
                >
                  {showFullAddress ? 'Truncate' : 'View Full'}
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200"
                  title="Copy full recipient address"
                >
                  <Copy className="w-3 h-3" />
                </button>
                {copied && <span className="text-[10px] text-emerald-400">Copied!</span>}
              </div>
            </div>
            <div className="mt-0.5 text-gray-300 break-all select-all">
              {showFullAddress
                ? preview.trustedRecipientAddress
                : `${preview.trustedRecipientAddress.slice(0, 16)}...${preview.trustedRecipientAddress.slice(-8)}`}
            </div>
          </div>

          <div className="col-span-2 pt-1 border-t border-gray-800/80 flex items-center justify-between text-[10px] text-gray-500">
            <span>
              Preview Expires: {new Date(preview.expiresAt).toLocaleTimeString()}
            </span>
            <span>Version Lock: v{preview.version}</span>
          </div>
        </div>

        {/* Status Callouts */}
        {isApproved && (
          <div
            data-testid="approved-status-banner"
            className="p-3 bg-emerald-950/60 border border-emerald-500/60 rounded-lg text-emerald-200 space-y-1"
          >
            <div className="flex items-center gap-1.5 font-bold text-sm text-emerald-300">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>Purchase approved — payment has not been executed.</span>
            </div>
            <p className="text-[11px] text-emerald-300/80">
              An immutable authorization snapshot (v{preview.version}) has been recorded. In Phase 2, signing and on-chain settlement are not executed. No funds have transferred.
            </p>
          </div>
        )}

        {isRejected && (
          <div
            data-testid="rejected-status-banner"
            className="p-3 bg-rose-950/60 border border-rose-500/60 rounded-lg text-rose-200 space-y-1"
          >
            <div className="flex items-center gap-1.5 font-bold text-xs text-rose-300">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>Purchase Rejected</span>
            </div>
            <p className="text-[11px] text-rose-300/80">
              This purchase intent was explicitly rejected and closed. It cannot be approved.
            </p>
          </div>
        )}

        {isExpired && !isApproved && !isRejected && (
          <div
            data-testid="expired-status-banner"
            className="p-3 bg-amber-950/60 border border-amber-500/60 rounded-lg text-amber-200 space-y-1"
          >
            <div className="flex items-center gap-1.5 font-bold text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Preview Expired</span>
            </div>
            <p className="text-[11px] text-amber-300/80">
              The 15-minute authorization window has expired. Please re-select a payment option to refresh the terms.
            </p>
          </div>
        )}

        {/* Action Controls */}
        {!isApproved && !isRejected && (
          <div className="pt-2 border-t border-gray-800 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => setShowRejectModal(true)}
              className="px-3 py-1.5 bg-gray-900 hover:bg-rose-950/50 hover:text-rose-300 hover:border-rose-800/80 text-gray-400 rounded-lg text-xs font-medium border border-gray-800 transition"
            >
              Reject Purchase
            </button>

            <button
              type="button"
              data-testid="approve-purchase-btn"
              disabled={loading || !canApprove}
              onClick={() => onApprove(preview.version)}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md transition"
            >
              <CheckCircle className="w-4 h-4" />
              <span>
                {loading
                  ? 'Authorizing...'
                  : `Approve Purchase (${preview.displayAmount} ${preview.currency})`}
              </span>
            </button>
          </div>
        )}

        {/* Rejection Input Dialog */}
        {showRejectModal && (
          <div className="p-3 bg-gray-900 border border-gray-700 rounded-lg space-y-2 mt-2">
            <label className="block text-[11px] font-medium text-gray-300">
              Provide Rejection Reason (optional):
            </label>
            <input
              type="text"
              placeholder="e.g. Terms too high or changed mind..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-gray-950 border border-gray-800 rounded text-gray-100 focus:outline-none focus:border-rose-500"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-2.5 py-1 text-[11px] text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-reject-btn"
                disabled={loading}
                onClick={async () => {
                  setShowRejectModal(false);
                  await onReject(rejectReason || 'User explicitly rejected terms');
                }}
                className="px-3 py-1 text-[11px] bg-rose-600 hover:bg-rose-500 text-white font-medium rounded"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        )}

        {/* Simulation Notice Footer */}
        <div className="pt-2 text-[10px] text-gray-500 font-mono text-center">
          {preview.simulatedNotice}
        </div>
      </div>
    </div>
  );
}
