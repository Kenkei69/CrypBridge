import { workspaceSession } from "../workspace-api";
export type Intent = {
  id: string;
  clientKey: string;
  buyer: string;
  payTo: string;
  amount: string;
  resource: string;
  state: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  txHash?: string;
  requirements: any;
};
export type Transfer = {
  id: string;
  txHash: string;
  sender: string;
  recipient: string;
  amount: string;
  blockNumber: string;
  timestamp: string;
  status: string;
  logIndex: number;
};
export type Decision = {
  id: string;
  intentId: string;
  allowed: boolean;
  rules: string[];
  attack?: string;
  createdAt: string;
};
export type History = {
  intents: Intent[];
  decisions: Decision[];
  transfers: Transfer[];
};
export async function live<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(apiPrefix() + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
export const initialize = (red: boolean) =>
  workspaceSession(red ? "red" : "blue");
export function units(value: string, decimals = 6) {
  const n = BigInt(value),
    scale = 10n ** BigInt(decimals),
    fraction = (n % scale)
      .toString()
      .padStart(decimals, "0")
      .replace(/0+$/, "");
  return `${n / scale}${fraction ? "." + fraction : ".00"}`;
}
export const shorten = (s?: string) =>
  s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "Not connected";
export const explorer = (hash: string) =>
  hash.startsWith("simtx:")
    ? `/platform/blockchain-tracing?transaction=${encodeURIComponent(hash)}`
    : `https://sepolia.basescan.org/tx/${hash}`;
export const stateLabel = (s: string) =>
  ({
    AWAITING_APPROVAL: "Awaiting approval",
    BLOCKED: "Blocked before signing",
    CONFIRMED: "Confirmed",
    CONFIRMING: "Confirming",
    SUBMITTED: "Pending",
    RESERVED: "Processing",
    RECONCILING: "Reconciling",
    REORGANIZED: "Reorganized",
    FAILED: "Failed",
  })[s] || s;
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
let runtimeMode: "simulation" | "testnet" = "simulation";
export const apiPrefix = () =>
  runtimeMode === "simulation" ? "/api/lab" : "/api/live";
let cachedRuntime: { mode: "simulation" | "testnet" } | undefined;
export async function loadRuntime() {
  if (cachedRuntime) return cachedRuntime;
  const r = await fetch("/api/runtime");
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Runtime connection failed");
  runtimeMode = data.mode;
  cachedRuntime = data as { mode: "simulation" | "testnet" };
  return cachedRuntime;
}
export async function lab<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/lab" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok)
    throw new Error(d.error || `Simulation request failed (${r.status})`);
  return d;
}
