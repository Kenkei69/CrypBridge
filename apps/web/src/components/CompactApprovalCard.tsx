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
  RefreshCw,
  Eye,
  X,
  Lock,
  Cpu,
  ChevronDown,
  ChevronUp,
  Shield,
  Gauge,
  Sliders,
} from 'lucide-react';
import type {
  ApprovalPreview,
  PaymentExecution,
  UserBudgetSummary,
  GuardianDecision,
} from '@x402/shared';

interface CompactApprovalCardProps {
  preview: ApprovalPreview;
  execution?: PaymentExecution | null;
  loading: boolean;
  budget?: UserBudgetSummary | null;
  guardianDecision?: GuardianDecision | null;
  onApprove: (expectedVersion: number) => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onSelectOption: (optionId: string) => Promise<void>;
  onRetryExecution?: (executionId: string) => Promise<void>;
}

export function CompactApprovalCard({
  preview,
  execution,
  loading,
  budget,
  guardianDecision,
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
  const [showGuardianDetails, setShowGuardianDetails] = useState(false);
  const [showBudgetDetails, setShowBudgetDetails] = useState(false);
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

  // Budget calculations
  const dailyLimitNum = budget ? Number(BigInt(budget.dailyLimitAmount)) / 10 ** budget.decimals : 500;
  const settledNum = budget ? Number(BigInt(budget.settledAmount)) / 10 ** budget.decimals : 0;
  const reservedNum = budget ? Number(BigInt(budget.reservedAmount)) / 10 ** budget.decimals : 0;
  const availableNum = budget ? Number(BigInt(budget.availableAmount)) / 10 ** budget.decimals : 500;
  const percentUsed = dailyLimitNum > 0 ? Math.min(100, Math.round(((settledNum + reservedNum) / dailyLimitNum) * 100)) : 0;

  return (
    <div
      data-testid="compact-approval-card"
      className="bg-gray-950/90 border border-gray-800 rounded-xl overflow-hidden shadow-xl backdrop-blur my-3 transition-all"
    >
      {/* Top Header Bar */}
      <div className="px-4 py-2.5 bg-gray-900/90 border-b border-gray-800 flex flex-wrap items-center justify-between gap-2">
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
          {/* Guardian Security Status Badge */}
          {isCompleted && (
            <span
              data-testid="guardian-status-badge"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 flex items-center gap-1 font-semibold"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              GUARDIAN: VERIFIED
            </span>
          )}
          {isBlocked && (
            <span
              data-testid="guardian-status-badge"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/80 flex items-center gap-1 font-semibold"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              GUARDIAN: BLOCKED
            </span>
          )}
          {isProcessing && (
            <span
              data-testid="guardian-status-badge"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-700/80 flex items-center gap-1 font-semibold animate-pulse"
            >
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              GUARDIAN: EVALUATING
            </span>
          )}
          {!isCompleted && !isBlocked && !isProcessing && (
            <span
              data-testid="guardian-status-badge"
              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800/80 flex items-center gap-1 font-semibold"
            >
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              GUARDIAN: ACTIVE
            </span>
          )}

          {/* Workflow Status Badge */}
          {isCompleted && (
            <span
              data-testid="status-badge-settled"
              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 flex items-center gap-1 font-semibold"
            >
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              Simulated Settled
            </span>
          )}
          {isProcessing && (
            <span
              data-testid="status-badge-processing"
              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-700/80 flex items-center gap-1 font-semibold animate-pulse"
            >
              <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
              Processing
            </span>
          )}
          {isReconciliationRequired && (
            <span
              data-testid="status-badge-reconcile"
              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/80 flex items-center gap-1 font-semibold"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              Reconciliation
            </span>
          )}
          {isBlocked && (
            <span
              data-testid="status-badge-blocked"
              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/80 flex items-center gap-1 font-semibold"
            >
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              Blocked
            </span>
          )}
          {isApproved && !isCompleted && !isProcessing && !isReconciliationRequired && !isBlocked && !isFailed && !isDeliveryFailed && (
            <span
              data-testid="status-badge-approved"
              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 flex items-center gap-1 font-semibold"
            >
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              Approved
            </span>
          )}
          {isRejected && (
            <span
              data-testid="status-badge-rejected"
              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/80 flex items-center gap-1 font-semibold"
            >
              <XCircle className="w-3 h-3 text-rose-400" />
              Rejected
            </span>
          )}
          {isExpired && !isApproved && !isRejected && (
            <span
              data-testid="status-badge-expired"
              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/80 flex items-center gap-1 font-semibold"
            >
              <Clock className="w-3 h-3 text-amber-400" />
              Expired
            </span>
          )}
          {!isApproved && !isRejected && !isExpired && (
            <span
              data-testid="status-badge-pending"
              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-700/80 flex items-center gap-1 font-semibold"
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
        {/* PHASE 4: DAILY BUDGET ALLOWANCE METER */}
        {/* ============================================================== */}
        <div
          data-testid="budget-meter"
          className="p-3 bg-gray-900/60 rounded-xl border border-gray-800/80 space-y-2 text-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-gray-200">
              <Gauge className="w-3.5 h-3.5 text-blue-400" />
              <span>Daily Spending Allowance</span>
              <span className="text-[10px] font-mono text-gray-400">
                ({preview.assetIdentifier} on Base Sepolia)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowBudgetDetails(!showBudgetDetails)}
              className="text-[10px] text-blue-400 hover:underline flex items-center gap-0.5"
            >
              <span>{showBudgetDetails ? 'Hide' : 'Details'}</span>
              {showBudgetDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="w-full bg-gray-950 rounded-full h-2 overflow-hidden border border-gray-800">
              <div
                className={`h-full transition-all duration-300 ${
                  percentUsed > 80 ? 'bg-rose-500' : percentUsed > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${percentUsed}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
              <span>Available: <strong className="text-emerald-400">${availableNum.toFixed(2)}</strong></span>
              <span>Daily Limit: <strong className="text-gray-300">${dailyLimitNum.toFixed(2)}</strong></span>
            </div>
          </div>

          {/* Detailed Budget Breakdown Accordion */}
          {showBudgetDetails && (
            <div className="p-2.5 bg-gray-950/60 rounded-lg border border-gray-800/60 font-mono text-[10px] space-y-1.5 text-gray-300">
              <div className="flex justify-between">
                <span className="text-gray-500">Settled Spend Today:</span>
                <span className="font-semibold text-gray-200">${settledNum.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Active Reservations:</span>
                <span className="font-semibold text-amber-300">${reservedNum.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Single Payment Limit:</span>
                <span className="font-semibold text-gray-200">
                  ${budget ? (Number(BigInt(budget.paymentLimitAmount)) / 10 ** budget.decimals).toFixed(2) : '100.00'} USDC
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-800/80 pt-1 text-gray-400">
                <span className="text-gray-500">Window Reset Boundary:</span>
                <span>Resets daily at 00:00 UTC</span>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* PHASE 4: EXPANDABLE GUARDIAN VERIFICATION DETAILS ACCORDION */}
        {/* ============================================================== */}
        <div className="border border-gray-800/80 rounded-xl overflow-hidden bg-gray-900/30">
          <button
            type="button"
            data-testid="guardian-accordion-toggle"
            onClick={() => setShowGuardianDetails(!showGuardianDetails)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-left text-xs hover:bg-gray-900/60 transition"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400" />
              <span className="font-semibold text-gray-200">Blue Team Guardian Verification Checks</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-900">
                5 Rules
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
              <span>{showGuardianDetails ? 'Collapse' : 'Expand'}</span>
              {showGuardianDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {showGuardianDetails && (
            <div
              data-testid="guardian-checks-accordion"
              className="p-3 bg-gray-950/70 border-t border-gray-800 space-y-2 text-[11px] font-mono text-gray-300"
            >
              <div className="flex items-center justify-between p-2 rounded bg-gray-900/50 border border-gray-800/60">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>1. Ownership & Approval Snapshot Integrity</span>
                </div>
                <span className="text-emerald-400 text-[10px]">VERIFIED (v{preview.version})</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-gray-900/50 border border-gray-800/60">
                <div className="flex items-center gap-2">
                  {isBlocked && execution?.failureCode === 'AMOUNT_MISMATCH' ? (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>2. Parameter Integrity (Exact Amount & Recipient)</span>
                </div>
                <span className={isBlocked && execution?.failureCode === 'AMOUNT_MISMATCH' ? 'text-rose-400 text-[10px]' : 'text-emerald-400 text-[10px]'}>
                  {isBlocked && execution?.failureCode === 'AMOUNT_MISMATCH' ? 'BLOCKED' : 'PASS'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-gray-900/50 border border-gray-800/60">
                <div className="flex items-center gap-2">
                  {isBlocked && execution?.failureCode === 'NETWORK_NOT_ALLOWED' ? (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>3. Pinned Protocol & Network Execution</span>
                </div>
                <span className="text-emerald-400 text-[10px]">Base Sepolia (eip155:84532) USDC</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-gray-900/50 border border-gray-800/60">
                <div className="flex items-center gap-2">
                  {isBlocked && execution?.failureCode?.includes('LIMIT_EXCEEDED') ? (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>4. Atomic Spending Reservation & Budget Policy</span>
                </div>
                <span className={isBlocked && execution?.failureCode?.includes('LIMIT_EXCEEDED') ? 'text-rose-400 text-[10px]' : 'text-emerald-400 text-[10px]'}>
                  {isBlocked && execution?.failureCode?.includes('LIMIT_EXCEEDED') ? 'LIMIT EXCEEDED' : 'RESERVED & ENFORCED'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-gray-900/50 border border-gray-800/60">
                <div className="flex items-center gap-2">
                  {isBlocked ? (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>5. Execution Permit & Worker Fencing Lease</span>
                </div>
                <span className={isBlocked ? 'text-rose-400 text-[10px]' : 'text-emerald-400 text-[10px]'}>
                  {isBlocked ? 'PERMIT REFUSED' : `HMAC BOUND (Fencing #${execution?.fencingToken || 1})`}
                </span>
              </div>

              <div className="pt-1 text-[10px] text-gray-500 text-center">
                Blue Team Invariant: Prompt text or model output cannot grant spending authority.
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* EXECUTION STATE CARDS */}
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
                <span>Guardian evaluation & atomic spending reservation verified</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span>Execution permit signed and verified by ConstrainedSimulationSigner</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span>Submitting x402 V2 PAYMENT-SIGNATURE challenge & committing ledger</span>
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
                    Settled under x402 V2 exact simulation protocol with committed budget reservation.
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

        {/* 3. Blocked State Card (Phase 4 Hardened) */}
        {isBlocked && (
          <div
            data-testid="blocked-card"
            className="p-4 bg-rose-950/70 border border-rose-500/80 rounded-xl space-y-3 text-rose-200 shadow-lg"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <h5 className="font-bold text-sm text-rose-300 leading-tight">
                    Simulated Payment Blocked by Guardian
                  </h5>
                  <p className="text-[11px] text-rose-400/80">
                    Deterministic zero-loss boundary enforced before payment authorization.
                  </p>
                </div>
              </div>
              {execution?.failureCode && (
                <span
                  data-testid="blocked-reason-code"
                  className="text-[10px] font-mono bg-rose-900/90 text-rose-200 px-2.5 py-1 rounded border border-rose-700 font-semibold shrink-0"
                >
                  {execution.failureCode}
                </span>
              )}
            </div>

            {/* Detailed Reason Message */}
            <div className="p-2.5 bg-rose-900/30 rounded-lg border border-rose-800/60 font-mono text-[11px] text-rose-100 leading-relaxed">
              {execution?.failureReason || 'Blue Team Guardian security engine blocked this transaction.'}
            </div>

            {/* Terms Comparison: Approved vs Proposed */}
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-rose-950/80 p-2.5 rounded border border-rose-900/80">
              <div className="space-y-1">
                <span className="text-rose-400 font-semibold block border-b border-rose-900/60 pb-0.5">Approved Terms (v{preview.version})</span>
                <div>Amount: <span className="text-gray-200">{preview.displayAmount} {preview.currency}</span></div>
                <div>Recipient: <span className="text-gray-200">{preview.trustedRecipientAddress.slice(0, 10)}...</span></div>
                <div>Asset: <span className="text-gray-200">{preview.assetIdentifier}</span></div>
              </div>
              <div className="space-y-1">
                <span className="text-rose-400 font-semibold block border-b border-rose-900/60 pb-0.5">Proposed Attack Terms</span>
                <div>Amount: <span className="text-rose-300 font-bold">{execution?.amount ? `${(Number(BigInt(execution.amount)) / 1000000).toFixed(2)} USDC` : 'Tampered / Mismatched'}</span></div>
                <div>Recipient: <span className="text-rose-300 font-bold">{execution?.recipientAddress ? `${execution.recipientAddress.slice(0, 10)}...` : 'Unknown'}</span></div>
                <div>Authorization: <span className="text-rose-300 font-bold">REJECTED</span></div>
              </div>
            </div>

            {/* Zero-Loss Boundary & Simulation Invariant Notice */}
            <div className="p-2.5 bg-rose-900/40 rounded border border-rose-800/80 text-[10px] font-mono text-center space-y-1 text-rose-200">
              <div>
                <strong>Authorization Status:</strong> Not Issued — Signer Boundary Enforced.
              </div>
              <div>
                <strong>Settlement Status:</strong> No simulated settlement recorded.
              </div>
              <div className="text-rose-400/80 pt-1 border-t border-rose-900/60">
                Simulation Mode: Zero-Loss Boundary Enforced. No real funds were transferred or protected.
              </div>
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
              The merchant settlement response was interrupted in transit. Guardian avoids duplicate charges by holding the budget reservation until reconciled.
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
              Your payment authorization was settled under reference <span className="font-mono text-amber-300 font-semibold">{execution?.settlementReference}</span>, but mock merchant delivery failed. The budget reservation remains COMMITTED, and safe retry will deliver the resource without re-charging.
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
              {execution?.failureReason || 'Settlement adapter rejected the simulated transaction. Budget reservation released safely.'}
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
              This purchase intent was explicitly rejected and closed. Any reserved budget was safely released.
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
