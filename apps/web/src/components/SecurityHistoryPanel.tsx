'use client';

import React from 'react';
import { History, Shield, AlertCircle, Clock } from 'lucide-react';
import type { AuditEvent } from '@x402/shared';

interface SecurityHistoryPanelProps {
  auditEvents: AuditEvent[];
  simulationMode: boolean;
  loading: boolean;
}

export function SecurityHistoryPanel({
  auditEvents,
  simulationMode,
  loading,
}: SecurityHistoryPanelProps) {
  return (
    <div className="bg-surface/80 border border-gray-800 rounded-xl p-5 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-semibold text-gray-100">Security & Audit History</h2>
        </div>
        <div className="flex items-center gap-2">
          {simulationMode && (
            <span className="text-xs px-2.5 py-1 bg-purple-950/60 text-purple-300 border border-purple-800/60 rounded-full font-mono">
              Simulation Records
            </span>
          )}
          <span className="text-xs px-2.5 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 rounded-full font-mono">
            Append-Only Audit Log
          </span>
        </div>
      </div>

      <div className="mb-4 text-xs text-gray-400 bg-gray-950/60 border border-gray-800/80 p-3 rounded-lg flex items-start gap-2.5">
        <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <strong>Immutable Security History:</strong> Every security event (logins, session creations, purchase intents) is recorded in an append-only audit ledger. Settled payments are never fabricated or invented.
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-400 text-sm">Loading security history...</div>
      ) : auditEvents.length === 0 ? (
        <div className="py-8 text-center text-gray-500 text-xs">
          No security events recorded yet. Perform actions to view verified audit trail.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {auditEvents.map((event) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
