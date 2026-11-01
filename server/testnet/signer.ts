import {simulationMode} from '../runtime';
// Only this module loads the buyer credential. No key is passed to merchant or chat code.
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { x402Client } from "@x402/core/client";
import { db } from "../config";
import { guard, binding } from "./guardian";
import { network, token, assertConfig } from "./chain";
function buyerAccount() {
  const key = process.env.BUYER_PRIVATE_KEY;
  if (!key) throw new Error("BUYER_PRIVATE_KEY secret not configured");
  try {
    return privateKeyToAccount(key as `0x${string}`);
  } catch {
    throw new Error("Invalid buyer signing credential");
  }
}
export function buyerAddress() {
  if (process.env.BUYER_PRIVATE_KEY) return buyerAccount().address;
  return process.env.BUYER_ADDRESS;
}
export async function signIntent(id: string) {
  if(simulationMode())throw new Error("Production/testnet signer is disabled in simulation mode");
  assertConfig();
  if (process.env.NODE_ENV !== "test" && process.env.DEMO_MODE === "true")
    throw new Error(
      "Funded signing requires DEMO_MODE=false and authenticated operator access",
    );
  const intent = await db.liveIntent.findUniqueOrThrow({ where: { id } });
  const required: any = intent.requirements;
  const decision = guard(intent, required);
  if (!decision.allowed)
    throw new Error("Signer Guardian rejected: " + decision.rules.join(","));
  const key = process.env.BUYER_PRIVATE_KEY;
  if (!key) throw new Error("BUYER_PRIVATE_KEY secret not configured");
  const account = buyerAccount();
  if (account.address.toLowerCase() !== intent.buyer.toLowerCase())
    throw new Error("Buyer credential mismatch");
  const client = new x402Client().register(
    network,
    new ExactEvmScheme({
      address: account.address,
      signTypedData: async (data: any) => {
        const d = data.domain,
          m = data.message;
        const now = BigInt(Math.floor(Date.now() / 1000));
        if (
          data.primaryType !== "TransferWithAuthorization" ||
          Number(d.chainId) !== 84532 ||
          String(d.verifyingContract).toLowerCase() !== token.toLowerCase() ||
          d.name !== "USDC" ||
          d.version !== "2" ||
          String(m.from).toLowerCase() !== intent.buyer.toLowerCase() ||
          String(m.to).toLowerCase() !== intent.payTo.toLowerCase() ||
          BigInt(m.value) !== BigInt(intent.amount) ||
          BigInt(m.validAfter) > now ||
          BigInt(m.validBefore) >
            BigInt(Math.floor(intent.expiresAt.getTime() / 1000)) ||
          BigInt(m.validBefore) <= now ||
          !/^0x[0-9a-fA-F]{64}$/.test(m.nonce)
        )
          throw new Error("Signing payload binding rejected");
        // Durable single-use gate occurs immediately before the private key operation.
        await db.$transaction(async (tx) => {
          const fresh = await tx.liveIntent.findUniqueOrThrow({
            where: { id },
          });
          if (
            !guard(fresh, required).allowed ||
            binding(fresh.requirements) !== decision.binding
          )
            throw new Error("Authorization changed");
          await tx.liveSigning.create({
            data: { intentId: id, nonce: m.nonce, binding: binding(data) },
          });
        });
        return account.signTypedData(data);
      },
    }),
  );
  return client.createPaymentPayload(required);
}
