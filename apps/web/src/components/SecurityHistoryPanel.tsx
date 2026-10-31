'use client';

import React, { useState } from 'react';
import {
  History,
  Shield,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Search,
  CheckCircle,
  XCircle,
  X,
  Lock,
  Layers,
  SlidersHorizontal,
  ChevronRight,
  Fingerprint,
} from 'lucide-react';
import type { AuditEvent, GuardianDecision, GuardianOutcome } from '@x402/shared';

interface SecurityHistoryPanelProps {
  auditEvents: AuditEvent[];
  guardianDecisions?: GuardianDecision[];
  simulationMode: boolean;
  loading: boolean;
  onRefresh?: () => Promise<void>;
}

export function SecurityHistoryPanel({
  auditEvents,
  guardianDecisions = [],
  simulationMode,
  loading,
}: SecurityHistoryPanelProps) {
  const [activeTab, setActiveTab] = useState<'decisions' | 'audit'>('decisions');
  const [filterOutcome, setFilterOutcome] = useState<'ALL' | 'ALLOW' | 'BLOCK'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDecision, setSelectedDecision] = useState<GuardianDecision | null>(null);

  // Filter decisions
  const filteredDecisions = guardianDecisions.filter((d) => {
    const outcomeMatch =
      filterOutcome === 'ALL'
        ? true
        : filterOutcome === 'ALLOW'
        ? d.outcome === 'ALLOW' || (d.decision as string) === 'allow' || (d.decision as string) === 'ALLOW'
        : d.outcome === 'BLOCK' || (d.decision as string) === 'block' || (d.decision as string) === 'BLOCK';

    if (!outcomeMatch) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.id.toLowerCase().includes(q) ||
      (d.reasonCode && d.reasonCode.toLowerCase().includes(q)) ||
      (d.reason && d.reason.toLowerCase().includes(q)) ||
      (d.correlationId && d.correlationId.toLowerCase().includes(q))
    );
  });

  return (
    <div
      data-testid="security-history-tab"
      className="bg-surface/80 border border-gray-800 rounded-xl p-5 shadow-lg backdrop-blur"
    >
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-semibold text-gray-100">Blue Team Security History</h2>
        </div>
        <div className="flex items-center gap-2">
          {simulationMode && (
            <span className="text-xs px-2.5 py-1 bg-purple-950/60 text-purple-300 border border-purple-800/60 rounded-full font-mono">
              Simulation Mode
            </span>
          )}
          <span className="text-xs px-2.5 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 rounded-full font-mono">
            Append-Only Decision Ledger
          </span>
        </div>
      </div>

      {/* Trust Notice */}
      <div className="mb-4 text-xs text-gray-400 bg-gray-950/60 border border-gray-800/80 p-3 rounded-lg flex items-start gap-2.5">
        <Lock className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <strong>Deterministic Zero-Loss Boundary:</strong> Every proposed payment is evaluated by the Blue Team Guardian before signing. Every decision (ALLOW or BLOCK) is persisted to an append-only ledger with structured checks, reason codes, and policy versioning.
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center justify-between border-b border-gray-800 mb-4 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="guardian-decisions-tab"
            onClick={() => setActiveTab('decisions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              activeTab === 'decisions'
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/60'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Guardian Decisions ({guardianDecisions.length})</span>
          </button>
          <button
            type="button"
            data-testid="audit-trail-tab"
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/60'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Trail ({auditEvents.length})</span>
          </button>
        </div>

        {/* Filter Controls (for Decisions) */}
        {activeTab === 'decisions' && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="filter-all"
              onClick={() => setFilterOutcome('ALL')}
              className={`px-2 py-1 text-[11px] font-mono rounded ${
                filterOutcome === 'ALL'
                  ? 'bg-gray-800 text-white font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              ALL
            </button>
            <button
              type="button"
              data-testid="filter-allow"
              onClick={() => setFilterOutcome('ALLOW')}
              className={`px-2 py-1 text-[11px] font-mono rounded flex items-center gap-1 ${
                filterOutcome === 'ALLOW'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700 font-semibold'
                  : 'text-gray-400 hover:text-emerald-400'
              }`}
            >
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              ALLOW
            </button>
            <button
              type="button"
              data-testid="filter-block"
              onClick={() => setFilterOutcome('BLOCK')}
              className={`px-2 py-1 text-[11px] font-mono rounded flex items-center gap-1 ${
                filterOutcome === 'BLOCK'
                  ? 'bg-rose-950 text-rose-300 border border-rose-700 font-semibold'
                  : 'text-gray-400 hover:text-rose-400'
              }`}
            >
              <XCircle className="w-3 h-3 text-rose-400" />
              BLOCK
            </button>
          </div>
        )}
      </div>

      {/* Decisions List View */}
      {activeTab === 'decisions' && (
        <div className="space-y-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-500" />
            <input
              type="text"
              placeholder="Filter by Reason Code, Correlation ID, or Decision ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-gray-950/70 border border-gray-800 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {loading ? (
            <div className="py-8 text-center text-gray-400 text-xs font-mono">Loading guardian decisions...</div>
          ) : filteredDecisions.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-xs">
              No Guardian decisions match the selected filter. Execute a purchase to generate explainable decisions.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {filteredDecisions.map((decision) => {
                const isAllow = decision.outcome === 'ALLOW' || (decision.decision as string) === 'allow' || (decision.decision as string) === 'ALLOW';
                return (
                  <div
                    key={decision.id}
                    data-testid={`decision-card-${decision.id}`}
                    className={`p-3 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                      isAllow
                        ? 'bg-emerald-950/20 border-emerald-900/60 hover:border-emerald-700/80'
                        : 'bg-rose-950/20 border-rose-900/60 hover:border-rose-700/80'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {isAllow ? (
                          <span
                            data-testid="decision-outcome-allow"
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3 text-emerald-400" />
                            ALLOW
                          </span>
                        ) : (
                          <span
                            data-testid="decision-outcome-block"
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-700 flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3 text-rose-400" />
                            BLOCK
                          </span>
                        )}

                        <span className="font-mono font-bold text-gray-200 text-xs">
                          {decision.reasonCode || 'AUTHORIZED'}
                        </span>

                        {decision.correlationId && (
                          <span className="text-[10px] font-mono text-gray-500 bg-gray-900/80 px-1.5 py-0.2 rounded border border-gray-800">
                            cid: {decision.correlationId.slice(0, 14)}...
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-gray-300 leading-snug">
                        {decision.reason}
                      </div>

                      <div className="text-[10px] font-mono text-gray-500 flex flex-wrap items-center gap-2">
                        <span>Decision ID: {decision.id.slice(0, 8)}...</span>
                        <span>•</span>
                        <span>Policy v{decision.policyVersion || 1}</span>
                        {decision.permitId && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400">Permit Issued</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-800">
                      <div className="text-[10px] font-mono text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(decision.evaluatedAt || decision.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>

                      <button
                        type="button"
                        data-testid="inspect-decision-btn"
                        onClick={() => setSelectedDecision(decision)}
                        className="px-2.5 py-1 bg-gray-900 hover:bg-gray-800 text-blue-400 hover:text-blue-300 rounded text-[11px] font-medium border border-gray-800 flex items-center gap-1 transition"
                      >
                        <span>Inspect</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Audit Trail List View */}
      {activeTab === 'audit' && (
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-8 text-center text-gray-400 text-xs font-mono">Loading audit trail...</div>
          ) : auditEvents.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-xs">
              No audit events recorded yet.
            </div>
          ) : (
            auditEvents.map((event) => (
              <div
                key={event.id}
                className="p-3 rounded-lg bg-gray-950/40 border border-gray-800/60 flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-blue-300">{event.eventType}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-gray-800 text-gray-300">
                      actor: {event.actorType}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 font-mono">
                    resource: {event.resourceType} ({event.resourceId.substring(0, 8)}...)
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[11px] font-mono text-gray-500 flex items-center gap-1 justify-end">
                    <Clock className="w-3 h-3" />
                    {new Date(event.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </div>
                  <div className="text-[10px] text-gray-600 font-mono">
                    {new Date(event.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* EXPANDED DECISION DETAILS MODAL */}
      {/* ============================================================== */}
      {selectedDecision && (
        <div
          data-testid="decision-details-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-gray-950 border border-gray-800 rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gray-900 border-b border-gray-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                <h4 className="font-semibold text-sm text-gray-100">
                  Guardian Decision Inspection
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDecision(null)}
                className="p-1 text-gray-400 hover:text-gray-200 rounded-md hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs font-mono">
              {/* Outcome Banner */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  selectedDecision.outcome === 'ALLOW' || (selectedDecision.decision as string) === 'allow' || (selectedDecision.decision as string) === 'ALLOW'
                    ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-200'
                    : 'bg-rose-950/60 border-rose-700/80 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {selectedDecision.outcome === 'ALLOW' || (selectedDecision.decision as string) === 'allow' || (selectedDecision.decision as string) === 'ALLOW' ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  )}
                  <div>
                    <div className="font-bold text-sm">
                      {selectedDecision.outcome || selectedDecision.decision}: {selectedDecision.reasonCode || 'AUTHORIZED'}
                    </div>
                    <div className="text-[11px] opacity-90">{selectedDecision.reason}</div>
                  </div>
                </div>
                <div className="text-right text-[10px]">
                  <div>Risk Score: {selectedDecision.riskScore ?? 0}</div>
                  <div>Policy v{selectedDecision.policyVersion || 1}</div>
                </div>
              </div>

              {/* Correlation & Identity Metadata */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-gray-900/60 rounded-xl border border-gray-800 text-[11px]">
                <div>
                  <span className="text-gray-500">Decision ID:</span>
                  <div className="text-gray-200 break-all select-all">{selectedDecision.id}</div>
                </div>
                <div>
                  <span className="text-gray-500">Correlation ID:</span>
                  <div className="text-gray-200 break-all select-all">{selectedDecision.correlationId || 'N/A'}</div>
                </div>
                <div>
                  <span className="text-gray-500">Evaluation Timestamp:</span>
                  <div className="text-gray-300">
                    {new Date(selectedDecision.evaluatedAt || selectedDecision.createdAt).toISOString()}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Execution Reference:</span>
                  <div className="text-gray-300 break-all">
                    {selectedDecision.paymentExecutionId || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Execution Permit & Reservation References */}
              {(selectedDecision.permitId || selectedDecision.reservationId) && (
                <div className="p-3 bg-blue-950/30 rounded-xl border border-blue-900/60 space-y-1.5 text-[11px]">
                  <div className="font-semibold text-blue-300 flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-blue-400" />
                    <span>Cryptographic Execution Permit & Budget Binding</span>
                  </div>
                  {selectedDecision.permitId && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Permit ID:</span>
                      <span className="text-blue-200 font-mono select-all">{selectedDecision.permitId}</span>
                    </div>
                  )}
                  {selectedDecision.reservationId && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Reservation ID:</span>
                      <span className="text-blue-200 font-mono select-all">{selectedDecision.reservationId}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Evaluated Rules Breakdown */}
              <div className="space-y-2">
                <span className="font-semibold text-gray-200 block text-xs">Structured Security Checks Evaluated:</span>
                <div className="space-y-1.5">
                  {selectedDecision.rulesEvaluated && selectedDecision.rulesEvaluated.length > 0 ? (
                    selectedDecision.rulesEvaluated.map((rule, idx) => (
                      <div
                        key={rule.ruleId || idx}
                        className={`p-2.5 rounded-lg border flex items-start justify-between gap-2 text-[11px] ${
                          rule.passed
                            ? 'bg-gray-900/40 border-gray-800 text-gray-300'
                            : 'bg-rose-950/40 border-rose-900 text-rose-200'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {rule.passed ? (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="font-semibold">{rule.ruleName || rule.ruleId}</div>
                            <div className="text-[10px] text-gray-400">{rule.reason}</div>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            rule.passed ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                          }`}
                        >
                          {rule.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-2 text-gray-500 text-center text-[10px]">
                      No individual rule telemetry recorded for this decision.
                    </div>
                  )}
                </div>
              </div>

              {/* Simulation Invariant Notice */}
              <div className="p-2.5 bg-gray-900/80 rounded-lg border border-gray-800 text-[10px] text-gray-400 text-center font-mono">
                <Lock className="w-3 h-3 text-blue-400 inline mr-1 -mt-0.5" />
                Demonstration security decision recorded in simulation mode. No real blockchain funds were transferred.
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-gray-900 border-t border-gray-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedDecision(null)}
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
