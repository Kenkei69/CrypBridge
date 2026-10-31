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
  Layers,
  Sparkles,
  RefreshCw,
  Eye,
  X,
  FileText,
  Lock,
  Cpu,
} from 'lucide-react';
import type { ApprovalPreview, PaymentExecution } from '@x402/shared';

interface CompactApprovalCardProps {
  preview: ApprovalPreview;
  execution?: PaymentExecution | null;
  loading: boolean;
  onApprove: (expectedVersion: number) => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onSelectOption: (optionId: string) => Promise<void>;
  onRetryExecution?: (executionId: string) => Promise<void>;
}

export function CompactApprovalCard({
  preview,
  execution,
  loading,
  onApprove,
  onReject,
  onSelectOption,
  onRetryExecution,
}: CompactApprovalCardProps) {
  const [copied, setCopied] = useState(false);
  const [copiedSettlement, setCopiedSettlement] = useState(false);
  const [showFullAddress, setShowFullAddress] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleCopyRecipient = () => {
    if (preview.trustedRecipientAddress) {
      navigator.clipboard.writeText(preview.trustedRecipientAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopySettlement = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedSettlement(true);
    setTimeout(() => setCopiedSettlement(false), 2000);
  };

  const handleRetry = async () => {
    if (!execution || !onRetryExecution || retrying) return;
    try {
      setRetrying(true);
      await onRetryExecution(execution.id);
    } finally {
      setRetrying(false);
    }
  };

  const isApproved = preview.status === 'approved';
  const isRejected = preview.status === 'rejected';
  const isExpired = preview.isExpired || preview.status === 'expired';
  const canApprove = preview.canApprove && !isApproved && !isRejected && !isExpired;

  // Execution State
  const executionStatus = execution?.executionStatus;
  const fulfillmentStatus = execution?.fulfillmentStatus;

  const isProcessing =
    isApproved &&
    (executionStatus === 'QUEUED' ||
      executionStatus === 'VALIDATING' ||
      executionStatus === 'SIMULATING_AUTHORIZATION' ||
      executionStatus === 'SETTLING_SIMULATION');

  const isCompleted = isApproved && executionStatus === 'SIMULATION_COMPLETED' && fulfillmentStatus === 'DELIVERED';
  const isDeliveryFailed = isApproved && executionStatus === 'SIMULATION_COMPLETED' && fulfillmentStatus === 'DELIVERY_FAILED';
  const isReconciliationRequired = isApproved && executionStatus === 'RECONCILIATION_REQUIRED';
  const isBlocked = isApproved && executionStatus === 'BLOCKED';
  const isFailed = isApproved && executionStatus === 'FAILED';

  return (
    <div
      data-testid="compact-approval-card"
      className="bg-gray-950/90 border border-gray-800 rounded-xl overflow-hidden shadow-xl backdrop-blur my-3 transition-all"
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
          {isCompleted && (
            <span
              data-testid="status-badge-settled"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 flex items-center gap-1 font-semibold"
            >
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              Simulated Settled
            </span>
          )}
          {isProcessing && (
            <span
              data-testid="status-badge-processing"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-700/80 flex items-center gap-1 font-semibold animate-pulse"
            >
              <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
              Processing
            </span>
          )}
          {isReconciliationRequired && (
            <span
              data-testid="status-badge-reconcile"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/80 flex items-center gap-1 font-semibold"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              Reconciliation
            </span>
          )}
          {isBlocked && (
            <span
              data-testid="status-badge-blocked"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/80 flex items-center gap-1 font-semibold"
            >
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              Blocked
            </span>
          )}
          {isApproved && !isCompleted && !isProcessing && !isReconciliationRequired && !isBlocked && !isFailed && !isDeliveryFailed && (
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
            <div className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap items-center gap-1.5">
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

        {/* Payment Option Selector (when not approved/rejected) */}
        {!isApproved && !isRejected && preview.availablePaymentOptions && preview.availablePaymentOptions.length > 0 && (
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
                const isPinned = opt.networkIdentifier === 'eip155:84532' && opt.assetIdentifier === 'USDC';
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
                      {isPinned && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 uppercase font-mono">
                          x402 V2 Ready
                        </span>
                      )}
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
                  onClick={handleCopyRecipient}
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

        {/* ============================================================== */}
        {/* PHASE 3 EXECUTION STATE CARDS */}
        {/* ============================================================== */}

        {/* 1. Active Processing State */}
        {isProcessing && (
          <div
            data-testid="processing-card"
            className="p-3.5 bg-blue-950/40 border border-blue-500/60 rounded-xl space-y-2.5 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-blue-300 text-xs">
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                <span>Simulated Payment Engine Executing...</span>
              </div>
              <span className="text-[10px] font-mono text-blue-400 uppercase bg-blue-900/60 px-2 py-0.5 rounded">
                Status: {executionStatus}
              </span>
            </div>

            <div className="space-y-1.5 text-[11px] text-blue-200/80 font-mono">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span>Validating requirements against approval snapshot (v{preview.version})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span>Emitting constrained HMAC simulation signature</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span>Submitting x402 V2 PAYMENT-SIGNATURE challenge & settling ledger</span>
              </div>
            </div>

            <div className="text-[10px] text-blue-400/70 border-t border-blue-900/60 pt-1.5">
              Simulation Mode: Server-controlled mock settlement; no real funds transferred.
            </div>
          </div>
        )}

        {/* 2. Verified Simulated Completion Card */}
        {isCompleted && (
          <div
            data-testid="simulated-completion-card"
            className="p-4 bg-emerald-950/50 border border-emerald-500/80 rounded-xl space-y-3 shadow-lg"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <h5 className="font-bold text-sm text-emerald-300 leading-tight">
                    Simulated Payment Completed & Verified
                  </h5>
                  <p className="text-[11px] text-emerald-400/80">
                    Settled under x402 V2 exact simulation protocol.
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono bg-emerald-900/80 text-emerald-200 px-2 py-0.5 rounded border border-emerald-700/60 shrink-0">
                DELIVERED
              </span>
            </div>

            {/* Authoritative Settlement Reference */}
            {execution?.settlementReference && (
              <div className="bg-emerald-900/30 p-2.5 rounded-lg border border-emerald-800/60 font-mono text-[11px] space-y-1">
                <div className="flex items-center justify-between text-emerald-300 text-[10px]">
                  <span>Authoritative Settlement ID:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopySettlement(execution.settlementReference!)}
                      className="p-1 hover:bg-emerald-800/50 rounded text-emerald-300"
                      title="Copy Settlement ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {copiedSettlement && <span className="text-[10px] text-emerald-300">Copied!</span>}
                  </div>
                </div>
                <div className="text-emerald-100 font-semibold break-all select-all">
                  {execution.settlementReference}
                </div>
              </div>
            )}

            {/* Settled Terms Summary */}
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-emerald-300/90 bg-emerald-950/80 p-2 rounded border border-emerald-900/60">
              <div>
                <span className="text-emerald-500">Network:</span> {preview.networkIdentifier}
              </div>
              <div>
                <span className="text-emerald-500">Asset:</span> {preview.assetIdentifier} (USDC)
              </div>
              <div>
                <span className="text-emerald-500">Amount:</span> {preview.displayAmount}
              </div>
              <div>
                <span className="text-emerald-500">Settled At:</span>{' '}
                {new Date(execution?.updatedAt || Date.now()).toLocaleTimeString()}
              </div>
            </div>

            {/* Prominent Simulation Invariant Banner */}
            <div className="p-2 bg-emerald-900/40 rounded border border-emerald-700/50 text-[10px] text-emerald-200 font-mono text-center font-medium">
              Simulation Mode: No real funds were transferred. No blockchain transaction occurred.
            </div>

            {/* View Demonstration Paywalled Resource Button */}
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                data-testid="view-resource-btn"
                onClick={() => setShowResourceModal(true)}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow transition"
              >
                <Eye className="w-4 h-4" />
                <span>View Demonstration Resource</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. Blocked State Card */}
        {isBlocked && (
          <div
            data-testid="blocked-card"
            className="p-3.5 bg-rose-950/60 border border-rose-500/80 rounded-xl space-y-2 text-rose-200"
          >
            <div className="flex items-center gap-2 font-bold text-xs text-rose-300">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Simulated Payment Blocked</span>
              {execution?.failureCode && (
                <span className="text-[10px] font-mono bg-rose-900/80 px-2 py-0.5 rounded border border-rose-800">
                  {execution.failureCode}
                </span>
              )}
            </div>
            <p className="text-[11px] text-rose-200/90 leading-relaxed">
              {execution?.failureReason || 'Authorization Gate refused to execute this simulated payment.'}
            </p>
            <div className="text-[10px] font-mono text-rose-400/80 pt-1 border-t border-rose-900/60">
              Zero-Loss Boundary Enforced: No payment authorization was produced and no settlement occurred.
            </div>
          </div>
        )}

        {/* 4. Ambiguous Outcome / Reconciliation Required Card */}
        {isReconciliationRequired && (
          <div
            data-testid="reconciliation-card"
            className="p-3.5 bg-amber-950/60 border border-amber-500/80 rounded-xl space-y-2.5 text-amber-200"
          >
            <div className="flex items-center gap-2 font-bold text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Payment Status Ambiguous — Reconciliation Required</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              The merchant settlement response was interrupted in transit. Guardian avoids duplicate charges by querying the immutable settlement ledger.
            </p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] font-mono text-amber-400">
                Attempts: {execution?.reconciliationAttempts || 1}
              </span>
              <button
                type="button"
                data-testid="reconcile-btn"
                disabled={retrying}
                onClick={handleRetry}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                <span>{retrying ? 'Reconciling...' : 'Reconcile Status'}</span>
              </button>
            </div>
          </div>
        )}

        {/* 5. Settlement Succeeded — Resource Delivery Failed Card */}
        {isDeliveryFailed && (
          <div
            data-testid="delivery-failed-card"
            className="p-3.5 bg-amber-950/60 border border-amber-500/80 rounded-xl space-y-2.5 text-amber-200"
          >
            <div className="flex items-center gap-2 font-bold text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Simulated Payment Settled — Paywalled Resource Delivery Interrupted</span>
            </div>
            <p className="text-[11px] text-amber-200/90">
              Your payment authorization was settled under reference <span className="font-mono text-amber-300 font-semibold">{execution?.settlementReference}</span>, but mock merchant delivery failed. Safe retry will deliver the resource without re-charging.
            </p>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                data-testid="retry-delivery-btn"
                disabled={retrying}
                onClick={handleRetry}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                <span>{retrying ? 'Delivering...' : 'Retry Delivery'}</span>
              </button>
            </div>
          </div>
        )}

        {/* 6. Execution Failed Card */}
        {isFailed && (
          <div
            data-testid="failed-card"
            className="p-3 bg-rose-950/60 border border-rose-500/60 rounded-xl space-y-1 text-rose-200"
          >
            <div className="flex items-center gap-1.5 font-bold text-xs text-rose-300">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>Simulated Payment Settlement Failed</span>
            </div>
            <p className="text-[11px] text-rose-300/80">
              {execution?.failureReason || 'Settlement adapter rejected the simulated transaction.'}
            </p>
          </div>
        )}

        {/* 7. Approved Snapshot Recorded Banner (compatibility message) */}
        {isApproved && !isCompleted && !isProcessing && !isReconciliationRequired && !isBlocked && !isFailed && !isDeliveryFailed && (
          <div
            data-testid="approved-status-banner"
            className="p-3 bg-emerald-950/60 border border-emerald-500/60 rounded-lg text-emerald-200 space-y-1"
          >
            <div className="flex items-center gap-1.5 font-bold text-sm text-emerald-300">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>Purchase approved — payment has not been executed.</span>
            </div>
            <p className="text-[11px] text-emerald-300/80">
              An immutable authorization snapshot (v{preview.version}) has been recorded.
            </p>
          </div>
        )}

        {/* 8. Rejected Banner */}
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
              This purchase intent was explicitly rejected and closed.
            </p>
          </div>
        )}

        {/* 9. Expired Banner */}
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

        {/* Action Controls for Unapproved Intents */}
        {!isApproved && !isRejected && (
          <div className="pt-2 border-t border-gray-800 space-y-2">
            <div className="text-[10px] text-gray-400 font-mono text-center">
              Approving will start a simulated purchase under simulation mode. No real funds or blockchain signatures are used.
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowRejectModal(true)}
                className="px-3 py-2 bg-gray-900 hover:bg-rose-950/50 hover:text-rose-300 hover:border-rose-800/80 text-gray-400 rounded-lg text-xs font-medium border border-gray-800 transition text-center"
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
                    ? 'Starting Simulated Purchase...'
                    : `Approve Purchase (${preview.displayAmount} ${preview.currency})`}
                </span>
              </button>
            </div>
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
          {preview.simulatedNotice || 'Simulation mode — no payment is executed or signed.'}
        </div>
      </div>

      {/* ============================================================== */}
      {/* DEMONSTRATION PAYWALLED RESOURCE MODAL INSPECTOR */}
      {/* ============================================================== */}
      {showResourceModal && execution?.deliveredResource && (
        <div
          data-testid="demonstration-resource-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-gray-950 border border-gray-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-gray-900 border-b border-gray-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-400" />
                <h4 className="font-semibold text-sm text-gray-100">
                  {execution.deliveredResource.title || 'Demonstration Resource'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowResourceModal(false)}
                className="p-1 text-gray-400 hover:text-gray-200 rounded-md hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center gap-2 text-emerald-300 bg-emerald-950/60 p-2.5 rounded-lg border border-emerald-800/60 text-xs">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Paywall Unlocked via x402 V2 Simulated Payment Authorization</span>
              </div>

              <div>
                <span className="text-[11px] text-gray-400 block mb-1">Description:</span>
                <p className="text-gray-200 leading-relaxed bg-gray-900/60 p-2.5 rounded border border-gray-800">
                  {execution.deliveredResource.description || preview.productDescription}
                </p>
              </div>

              {/* Delivered Payload Display */}
              <div>
                <span className="text-[11px] text-gray-400 block mb-1">Delivered Demonstration Payload:</span>
                <pre className="p-3 bg-gray-900/90 rounded-lg border border-gray-800 font-mono text-[11px] text-emerald-300 overflow-x-auto select-all">
                  {typeof execution.deliveredResource.deliveredPayload === 'object'
                    ? JSON.stringify(execution.deliveredResource.deliveredPayload, null, 2)
                    : String(execution.deliveredResource.deliveredPayload)}
                </pre>
              </div>

              {/* Settlement Reference */}
              <div className="space-y-1 font-mono text-[11px]">
                <span className="text-gray-400">Settlement Identifier:</span>
                <div className="p-2 bg-gray-900/40 rounded border border-gray-800 text-gray-300 break-all">
                  {execution.settlementReference}
                </div>
              </div>

              {/* Prominent Simulation Invariant */}
              <div className="p-2.5 bg-gray-900/80 rounded-lg border border-gray-800 text-[10px] text-gray-400 font-mono text-center">
                <Lock className="w-3.5 h-3.5 text-blue-400 inline mr-1 -mt-0.5" />
                Demonstration paywalled asset delivered in local simulation. No real blockchain funds transferred.
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-gray-900/90 border-t border-gray-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowResourceModal(false)}
                className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
