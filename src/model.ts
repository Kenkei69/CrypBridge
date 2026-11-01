import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Wallet,
  Activity,
  SlidersHorizontal,
  FlaskConical,
  Crosshair,
  ScanLine,
  FileText,
  Blocks,
  Settings,
  Waypoints,
  Flag,
  Building2,
} from "lucide-react";
export type Page =
  | "Overview"
  | "Wallet Security"
  | "Payment Monitor"
  | "Security Policies"
  | "Red Team Lab"
  | "Attack Simulator"
  | "Guard Testing"
  | "Blockchain Tracing"
  | "Scam Reports"
  | "Exchange Response"
  | "Security Reports"
  | "API & Integrations"
  | "Settings";
export const navigation: {
  group: string;
  items: { page: Page; label: string; icon: LucideIcon }[];
}[] = [
  {
    group: "Main",
    items: [
      { page: "Overview", label: "Overview", icon: LayoutDashboard },
      { page: "Wallet Security", label: "Wallet security", icon: Wallet },
      { page: "Payment Monitor", label: "Payment monitor", icon: Activity },
      {
        page: "Security Policies",
        label: "Security policies",
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    group: "Security testing",
    items: [
      { page: "Red Team Lab", label: "Red Team Lab", icon: FlaskConical },
      { page: "Attack Simulator", label: "Attack simulator", icon: Crosshair },
      { page: "Guard Testing", label: "Guard testing", icon: ScanLine },
    ],
  },
  {
    group: "Intelligence",
    items: [
      {
        page: "Blockchain Tracing",
        label: "Blockchain tracing",
        icon: Waypoints,
      },
      { page: "Scam Reports", label: "Scam reports", icon: Flag },
      {
        page: "Exchange Response",
        label: "Exchange response",
        icon: Building2,
      },
    ],
  },
  {
    group: "System",
    items: [
      { page: "Security Reports", label: "Reports", icon: FileText },
      { page: "API & Integrations", label: "API & integrations", icon: Blocks },
      { page: "Settings", label: "Settings", icon: Settings },
    ],
  },
];
export interface Policy {
  maxPayment: string;
  dailyLimit: string;
  sessionLimit: string;
  approvalAbove: string;
  expectedPrice: string;
  deviationBps: number;
  recipient: string;
  asset: string;
  network: string;
  scheme: string;
  service: string;
  enabled: boolean;
}
export interface WalletRecord {
  id: string;
  name: string;
  address: string;
  network: string;
  mode: string;
  enabled: boolean;
}
export interface Agent {
  id: string;
  name: string;
  walletId: string;
  status: string;
}
export interface Guard {
  id: string;
  name: string;
  endpoint: string;
}
export interface Result {
  category: string;
  expected: string;
  actual: string;
  passed: boolean;
  reason: string;
  duration: number;
}
export interface Report {
  id: string;
  guardId: string;
  guard: Guard;
  score: number;
  createdAt: string;
  results: {
    suiteVersion: string;
    results: Result[];
    falsePositives: number;
    falseNegatives: number;
  };
}
export interface Payment {
  id: string;
  agentId: string;
  amount: string;
  decision: string;
  risk: number;
  rules: string[];
  createdAt: string;
  mode: string;
  envelope: {
    service: string;
    payment: { accepted: { payTo: string; asset: string; network: string } };
  };
  explanation?: string;
}
export interface State {
  wallets: WalletRecord[];
  agents: Agent[];
  policy: { version: number; config: Policy };
  payments: Payment[];
  guards: Guard[];
  reports: Report[];
  categories: string[];
}
export const title = (s: string) =>
  s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export const short = (s: string) =>
  s.length > 18 ? `${s.slice(0, 7)}…${s.slice(-5)}` : s;
export const date = (s: string) =>
  new Date(s).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function units(value: string) {
  if (!/^\d+$/.test(value)) return value;
  const n = BigInt(value);
  return `${n / 1000000n}.${(n % 1000000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0")}`;
}
export const scenarios: Record<string, { label: string; description: string }> =
  {
    overpayment: {
      label: "Overpayment",
      description: "Request more than the trusted service price.",
    },
    wrong_party: {
      label: "Wrong party",
      description: "Replace the intended payment recipient.",
    },
    token_substitution: {
      label: "Token substitution",
      description: "Swap an approved token for an unknown asset.",
    },
    network_manipulation: {
      label: "Network manipulation",
      description: "Change the expected blockchain network.",
    },
    replay: {
      label: "Duplicate payment",
      description: "Reuse an already consumed authorization.",
    },
    expiration: {
      label: "Expiration",
      description: "Submit a payment outside its validity window.",
    },
    signature: {
      label: "Signature manipulation",
      description: "Test an invalid mock authorization marker.",
    },
    precision: {
      label: "Amount precision",
      description: "Send a malformed token base-unit amount.",
    },
    tampering: {
      label: "Requirement tampering",
      description: "Mismatch the requested and authorized amount.",
    },
    concurrency: {
      label: "Concurrent payments",
      description: "Race requests using the same authorization.",
    },
  };
export function filterScenarios(categories: string[], query: string) {
  const q = query.trim().toLowerCase();
  return categories.filter((c) =>
    `${c} ${scenarios[c]?.label} ${scenarios[c]?.description}`
      .toLowerCase()
      .includes(q),
  );
}
export function outcome(result: Result) {
  return result.actual === "block"
    ? "Blocked"
    : result.actual === "approve"
      ? "Allowed"
      : result.actual === "require_approval"
        ? "Review"
        : "Error";
}
