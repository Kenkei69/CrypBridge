import { createHash } from "node:crypto";
import { network, token } from "./chain";
function canonical(v: any): any {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, canonical(v[k])]),
    );
  return typeof v === "bigint" ? v.toString() : v;
}
export const binding = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
export function guard(
  intent: any,
  required: any,
  method = "TransferWithAuthorization",
) {
  const r = required?.accepts?.[0];
  const rules: string[] = [];
  if (!intent.approvedAt) rules.push("USER_APPROVAL_REQUIRED");
  if (intent.state !== "RESERVED") rules.push("SINGLE_USE_STATE");
  if (new Date(intent.expiresAt).getTime() <= Date.now())
    rules.push("AUTHORIZATION_EXPIRED");
  if (required?.x402Version !== 2 || required?.accepts?.length !== 1)
    rules.push("X402_VERSION");
  if (r?.network !== network) rules.push("NETWORK");
  if (r?.scheme !== "exact") rules.push("SCHEME");
  if (r?.asset?.toLowerCase() !== token.toLowerCase()) rules.push("ASSET");
  if (r?.payTo?.toLowerCase() !== intent.payTo.toLowerCase())
    rules.push("RECIPIENT");
  if (
    !/^[0-9]+$/.test(r?.amount || "") ||
    r.amount !== intent.amount ||
    BigInt(r.amount) > 1000000n
  )
    rules.push("AMOUNT");
  if (required?.resource?.url !== intent.resource) rules.push("RESOURCE");
  if (
    !Number.isInteger(r?.maxTimeoutSeconds) ||
    r.maxTimeoutSeconds < 1 ||
    r.maxTimeoutSeconds > 300
  )
    rules.push("EXPIRY");
  if (
    r?.extra?.name !== "USDC" ||
    r?.extra?.version !== "2" ||
    r?.extra?.assetTransferMethod !== "eip3009"
  )
    rules.push("SIGNING_DOMAIN");
  if (method !== "TransferWithAuthorization")
    rules.push("UNSUPPORTED_SIGNING_METHOD");
  if (required?.extensions && Object.keys(required.extensions).length)
    rules.push("UNSUPPORTED_EXTENSIONS");
  return { allowed: rules.length === 0, rules, binding: binding(required) };
}
