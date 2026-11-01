export interface Trusted {
  amount: string;
  recipient: string;
  asset: string;
  network: string;
  scheme: string;
  walletAddress: string;
  resourceUrl: string;
  digest?: string;
  id?: string;
  expiresAt?: string;
}
export interface Simulation {
  id: string;
  prompt: string;
  stage: string;
  windowExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  resourceId: string;
  walletId: string;
  proposal: Trusted & { name: string; budget: string };
  authorization: (Trusted & { id: string; approvedAt: string }) | null;
  original: any;
  modified: any;
  delivery: {
    content: string;
    name: string;
    ledgerEntryId: string;
    amount: string;
    blockchainTransaction: null;
  } | null;
  resource: {
    id: string;
    name: string;
    price: string;
    merchant: {
      id: string;
      name: string;
      recipient: string;
      asset: string;
      network: string;
    };
  };
  transfer: { id: string; amount: string } | null;
  decisions: {
    id: string;
    decision: string;
    rules: string[];
    explanation: string;
    policyVersion: number;
    createdAt: string;
  }[];
  attacks: {
    id: string;
    category: string;
    payload: any;
    objective: string;
    defenderDecision: string;
    reason: string;
    deliveryStatus: string;
    original: any;
    modified: any;
    createdAt: string;
  }[];
  events: {
    id: string;
    sequence: number;
    type: string;
    source: string;
    data: any;
    createdAt: string;
  }[];
  signings: { id: string; createdAt: string; consumedAt: string | null }[];
}
export interface GuardianPolicy {
  enabled: boolean;
  maxPayment: string;
  dailyLimit: string;
  sessionLimit: string;
  allowedNetwork: string;
  allowedAsset: string;
  allowContractCalls: false;
}
export interface SimulationState {
  conversationHeads?: { id: string; updatedAt: string }[];
  simulations: Simulation[];
  catalog: {
    id: string;
    name: string;
    price: string;
    merchant: {
      id: string;
      name: string;
      recipient: string;
      asset: string;
      network: string;
    };
  }[];
  policy: { version: number; config: GuardianPolicy };
  accounts: { id: string; address: string; balance: string }[];
  mode: "mock";
}
export const stages: Record<string, string> = {
  AWAITING_APPROVAL: "Awaiting your confirmation",
  CREATED: "Purchase created",
  AUTHORIZED: "User authorization saved",
  APPROVED: "Mock signing approved",
  MOCK_SETTLED: "Settled in mock ledger",
  CANCELLED: "Canceled",
  ATTACK_WINDOW_OPEN: "Attack window open",
  EVALUATING: "Blue Team evaluating",

  COMPLETED: "Mock-settled · resource delivered",
  BLOCKED: "Blocked before signing",
  FAILED: "Execution error · inspect timeline",
};
export const attacks = [
  {
    id: "overpayment",
    name: "Overpayment",
    description: "Inflate the merchant payment requirement.",
  },
  {
    id: "wrong_recipient",
    name: "Wrong recipient",
    description: "Replace the merchant recipient address.",
  },
  {
    id: "prompt_injection",
    name: "Prompt injection",
    description: "Inject untrusted merchant instructions.",
  },
  {
    id: "duplicate_payment",
    name: "Duplicate payment",
    description: "Repeat payment requests for one purchase.",
  },
  {
    id: "contract_approval",
    name: "Malicious contract approval",
    description: "Propose an unauthorized token allowance.",
  },
];

export function attackWindowOpen(s: Simulation | undefined) {
  return Boolean(
    s?.stage === "ATTACK_WINDOW_OPEN" &&
      s.windowExpiresAt &&
      new Date(s.windowExpiresAt).getTime() > Date.now(),
  );
}
