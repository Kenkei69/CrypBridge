// Simulation-only signer: derives PUBLICLY KNOWN, unfunded test keys from the fixture seed.
// No production key, signer module, RPC client, or broadcast method is imported here.
import { verifyTypedData } from "viem";
import {
  ASSET,
  CHAIN,
  EPOCH,
  Tx,
  digest,
  emit,
  json,
  testAccount,
  walletId,
} from "./core";
import { evaluateRules, Context } from "./guardian";
export const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;
export function typedData(authorization: any) {
  return {
    domain: {
      name: "USDC",
      version: "2",
      chainId: CHAIN,
      verifyingContract: ASSET,
    },
    types,
    primaryType: "TransferWithAuthorization" as const,
    message: {
      ...authorization,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
    },
  };
}
export async function sign(
  tx: Tx,
  environmentId: string,
  purchase: any,
  attempt: any,
  context: Context,
  approvedBinding: string,
  baseline = false,
) {
  const env = await tx.labEnvironment.findUniqueOrThrow({
    where: { id: environmentId },
  });
  if (baseline && env.kind !== "BASELINE")
    throw new Error(
      "Vulnerable signer is restricted to an isolated BASELINE fixture",
    );
  const checked = evaluateRules({
    ...context,
    previousBinding: approvedBinding,
  });
  if (!baseline && checked.decision !== "ALLOW")
    return { signed: null, checked };
  const r = context.input.requirements.accepts[0],
    account = testAccount(env.seed, "buyer");
  const nonce = ("0x" +
    digest({
      seed: env.seed,
      purchase: purchase.ordinal,
      scope: "single-use purchase authorization",
    })) as `0x${string}`;
  if (
    await tx.labNonce.findUnique({
      where: {
        environmentId_authorizer_nonce: {
          environmentId,
          authorizer: account.address,
          nonce,
        },
      },
    })
  )
    throw new Error("Authorization nonce already consumed");
  const authorization = {
    from: account.address,
    to: r.payTo,
    value: r.amount,
    validAfter: String(Math.floor((EPOCH + env.clock) / 1000) - 1),
    validBefore: String(
      Math.floor(
        (EPOCH +
          Math.min(context.authorization.expiresAt, env.clock + 120000)) /
          1000,
      ),
    ),
    nonce,
  };
  const data = typedData(authorization);
  const signature = await account.signTypedData(data as any);
  const payload = {
    x402Version: 2,
    resource: context.input.requirements.resource,
    accepted: r,
    payload: { signature, authorization },
  };
  const signed = await tx.labSigning.create({
    data: {
      id: environmentId + ":sign:" + purchase.ordinal,
      environmentId,
      purchaseId: purchase.id,
      attemptId: attempt.id,
      authorizationId: context.authorization.id,
      nonce,
      binding: digest(context.input),
      typedData: json(data),
      payload: json(payload),
      signatureKind:
        "GENUINE_TEST_ONLY_EIP712_ECDSA; PUBLICLY_DERIVABLE_UNFUNDED_KEY",
      createdAt: env.clock,
    },
  });
  await emit(
    tx,
    environmentId,
    baseline
      ? "BASELINE_UNSAFE_TEST_SIGNATURE"
      : "PAYMENT_AUTHORIZATION_SIGNED",
    "signer",
    {
      signatureKind: signed.signatureKind,
      authorizationDigest: context.authorization.digest,
      nonce,
      finalPayloadDigest: signed.binding,
      publicNetworkSubmission: false,
    },
    purchase.id,
    signed.id,
  );
  return { signed, checked };
}
export async function verifyPayload(
  payload: any,
  expectedBuyer: string,
  clock: number,
) {
  try {
    const a = payload?.payload?.authorization,
      r = payload?.accepted;
    const second = BigInt(Math.floor((EPOCH + clock) / 1000));
    if (
      payload?.x402Version !== 2 ||
      r?.scheme !== "exact" ||
      (r?.extra?.assetTransferMethod ?? "eip3009") !== "eip3009" ||
      r?.network !== "eip155:84532" ||
      r?.asset?.toLowerCase() !== ASSET.toLowerCase() ||
      !a ||
      a.from.toLowerCase() !== expectedBuyer.toLowerCase() ||
      a.to.toLowerCase() !== r.payTo.toLowerCase() ||
      a.value !== r.amount ||
      !/^0x[0-9a-fA-F]{64}$/.test(a.nonce) ||
      BigInt(a.validAfter) > second ||
      BigInt(a.validBefore) <= second
    )
      return { isValid: false, reason: "PROTOCOL_AUTHORIZATION_MISMATCH" };
    const valid = await verifyTypedData({
      ...typedData(a),
      address: expectedBuyer as `0x${string}`,
      signature: payload.payload.signature,
    });
    return {
      isValid: valid,
      reason: valid ? "EIP712_SIGNATURE_VERIFIED" : "INVALID_EIP712_SIGNATURE",
    };
  } catch {
    return { isValid: false, reason: "INVALID_EIP712_SIGNATURE" };
  }
}
