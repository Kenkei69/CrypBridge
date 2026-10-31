import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export function SimulationBanner() {
  return (
    <div className="bg-amber-950/80 border-b border-amber-500/40 px-4 py-2 text-xs text-amber-200">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-bold tracking-wider uppercase text-amber-300">Phase 1 Simulation Mode Active:</span>
          <span>No blockchain transactions or live signing keys are used. Spending authority requires authenticated server authorization.</span>
        </div>
        <div className="flex items-center gap-2 text-amber-300/80">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>x402 Spec: draft-v1 | EIP-712 Exact Payment Scheme</span>
        </div>
      </div>
    </div>
  );
}
