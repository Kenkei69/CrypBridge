import {
  encodeAbiParameters,
  getAddress,
  encodeEventTopics,
  parseAbiItem,
  encodeFunctionData,
  parseAbi,
} from "viem";
import {
  ASSET,
  EPOCH,
  Tx,
  amount,
  digest,
  emit,
  journal,
  walletId,
  json,
} from "./core";
export const transferAbi = parseAbiItem(
  "event Transfer(address indexed from,address indexed to,uint256 value)",
);
export const erc3009Abi = parseAbi([
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)",
]);
export const GAS = 65000n,
  FEE = 1000000000n;
export async function mine(
  tx: Tx,
  environmentId: string,
  reason = "explicit virtual block production",
) {
  const env = await tx.labEnvironment.findUniqueOrThrow({
    where: { id: environmentId },
  });
  const previous = await tx.labBlock.findFirst({
    where: { environmentId, canonical: true },
    orderBy: { number: "desc" },
  });
  const number = env.head + 1;
  const e = await emit(
    tx,
    environmentId,
    "VIRTUAL_BLOCK_PRODUCED",
    "blockchain",
    { number, reason },
  );
  const hash =
    "simblock:" +
    digest({
      seed: env.seed,
      number,
      parent: previous?.hash || "simulation-genesis",
      timestamp: e.timestamp,
    });
  const block = await tx.labBlock.create({
    data: {
      id: environmentId + ":block:" + number + ":" + hash.slice(-10),
      environmentId,
      number,
      hash,
      parentHash: previous?.hash || "simulation-genesis",
      timestamp: e.timestamp,
    },
  });
  await tx.labEnvironment.update({
    where: { id: environmentId },
    data: { head: number },
  });
  await updateConfirmations(tx, environmentId, number);
  return block;
}
async function updateConfirmations(
  tx: Tx,
  environmentId: string,
  number: number,
) {
  for (const t of await tx.labTransaction.findMany({
    where: { environmentId, status: { not: "REORGANIZED" } },
  })) {
    const b = await tx.labBlock.findUniqueOrThrow({ where: { id: t.blockId } });
    const confirmations = number - b.number + 1;
    await tx.labTransaction.update({
      where: { id: t.id },
      data: { confirmations },
    });
    const execution = await tx.labExecution.findUnique({
      where: { transactionId: t.id },
    });
    if (execution)
      await tx.labExecution.update({
        where: { id: execution.id },
        data: { receipt: { ...(execution.receipt as any), confirmations } },
      });
  }
}
export async function transfer(
  tx: Tx,
  environmentId: string,
  fromRole: string,
  recipient: string,
  value: string,
  authorizationRef: string,
  operation: string,
  purchaseId?: string,
  typedPayload?: any,
  revert = false,
) {
  const env = await tx.labEnvironment.findUniqueOrThrow({
    where: { id: environmentId },
  });
  recipient = getAddress(recipient.toLowerCase());
  const sender = await tx.labWallet.findUniqueOrThrow({
    where: { id: walletId(environmentId, fromRole) },
  });
  let receiver = await tx.labWallet.findUnique({
    where: { environmentId_address: { environmentId, address: recipient } },
  });
  if (!receiver)
    receiver = await tx.labWallet.create({
      data: {
        id: environmentId + ":recipient:" + digest(recipient).slice(0, 16),
        environmentId,
        role: "recipient-" + digest(recipient).slice(0, 12),
        address: recipient,
      },
    });
  if (BigInt(value) <= 0n || BigInt(value) >= 2n ** 256n)
    throw new Error("Invalid virtual transfer amount");
  if ((await amount(tx, environmentId, fromRole)) < BigInt(value))
    throw new Error("Insufficient virtual USDC");
  if ((await amount(tx, environmentId, "facilitator", "ETH")) < GAS * FEE)
    throw new Error("Insufficient virtual facilitator gas");
  const signing = await tx.labSigning.findFirst({
    where: { id: authorizationRef, environmentId },
  });
  const movement = await tx.labMovementAuthorization.findFirst({
    where: { id: authorizationRef, environmentId },
  });
  if (!signing && !movement)
    throw new Error("No persisted signing authorization for virtual execution");
  if (
    movement &&
    (movement.fromRole !== fromRole ||
      movement.recipient !== recipient ||
      movement.amount !== value ||
      env.kind !== "BASELINE")
  )
    throw new Error("Virtual movement authorization mismatch");
  const block = await mine(tx, environmentId, operation);
  const facilitator = await tx.labWallet.findUniqueOrThrow({
    where: { id: walletId(environmentId, "facilitator") },
  });
  const nonce = facilitator.transactionNonce;
  const reference =
    "simtx:" +
    digest({
      seed: env.seed,
      block: block.number,
      sender: sender.address,
      recipient,
      value,
      nonce,
      authorizationRef: authorizationRef.startsWith(environmentId + ":")
        ? authorizationRef.slice(environmentId.length + 1)
        : authorizationRef,
      operation,
    });
  const id = environmentId + ":" + reference;
  let calldata = "0x";
  if (typedPayload) {
    const a = typedPayload.payload.authorization,
      sig = typedPayload.payload.signature;
    calldata = encodeFunctionData({
      abi: erc3009Abi,
      functionName: "transferWithAuthorization",
      args: [
        a.from,
        a.to,
        BigInt(a.value),
        BigInt(a.validAfter),
        BigInt(a.validBefore),
        a.nonce,
        parseInt(sig.slice(-2), 16),
        ("0x" + sig.slice(2, 66)) as `0x${string}`,
        ("0x" + sig.slice(66, 130)) as `0x${string}`,
      ],
    });
  }
  const t = await tx.labTransaction.create({
    data: {
      id,
      environmentId,
      purchaseId,
      blockId: block.id,
      reference,
      sender: facilitator.address,
      recipient: ASSET,
      tokenSender: sender.address,
      tokenRecipient: recipient,
      contract: ASSET,
      tokenAmount: revert ? "0" : value,
      value: "0",
      nonce,
      gasLimit: "100000",
      gasUsed: GAS.toString(),
      feePerGas: FEE.toString(),
      calldata,
      status: revert ? "FAILED" : "SUCCESS",
      confirmations: 1,
      timestamp: block.timestamp,
      authorizationRef,
      operation,
    },
  });
  await journal(
    tx,
    environmentId,
    "facilitator",
    "ETH",
    -GAS * FEE,
    "GAS_DEBIT",
    id,
  );
  await tx.labWallet.update({
    where: { id: facilitator.id },
    data: { transactionNonce: { increment: 1 } },
  });
  if (!revert) {
    await journal(
      tx,
      environmentId,
      fromRole,
      "USDC",
      -BigInt(value),
      "TRANSFER_DEBIT",
      id,
    );
    await journal(
      tx,
      environmentId,
      receiver.role,
      "USDC",
      BigInt(value),
      "TRANSFER_CREDIT",
      id,
    );
    await tx.labLog.create({
      data: {
        id: id + ":log:0",
        environmentId,
        transactionId: id,
        blockId: block.id,
        index: 0,
        contract: ASSET,
        topics: encodeEventTopics({
          abi: [transferAbi],
          eventName: "Transfer",
          args: {
            from: sender.address as `0x${string}`,
            to: recipient as `0x${string}`,
          },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [BigInt(value)]),
        decoded: {
          sender: sender.address,
          recipient,
          amount: value,
          asset: ASSET,
        },
        status: "CANONICAL",
      },
    });
  }
  await tx.labExecution.create({
    data: {
      id: id + ":execution",
      environmentId,
      transactionId: id,
      authorizationRef,
      state: revert ? "FAILED" : "SUCCESS",
      receipt: {
        simulation: true,
        transactionReference: reference,
        blockNumber: block.number,
        blockHash: block.hash,
        transactionIndex: 0,
        status: revert ? "REVERTED" : "SUCCESS",
        gasUsed: GAS.toString(),
        effectiveGasPrice: FEE.toString(),
        logs: revert ? [] : [id + ":log:0"],
        confirmations: 1,
      },
    },
  });
  await emit(
    tx,
    environmentId,
    revert ? "VIRTUAL_TRANSACTION_REVERTED" : "VIRTUAL_USDC_TRANSFER_EXECUTED",
    "blockchain",
    {
      reference,
      blockNumber: block.number,
      sender: sender.address,
      recipient,
      amount: revert ? "0" : value,
      gasUsed: GAS.toString(),
      fee: (GAS * FEE).toString(),
      simulation: true,
    },
    purchaseId,
    id,
  );
  return t;
}
export async function index(tx: Tx, environmentId: string) {
  const logs = await tx.labLog.findMany({
    where: { environmentId, status: "CANONICAL" },
    orderBy: { id: "asc" },
  });
  for (const l of logs) {
    const d = l.decoded as any;
    const t = await tx.labTransaction.findUniqueOrThrow({
      where: { id: l.transactionId },
    });
    await tx.labFlowEdge.upsert({
      where: { logId: l.id },
      create: {
        id: l.id + ":edge",
        environmentId,
        logId: l.id,
        transactionId: t.id,
        sender: d.sender,
        recipient: d.recipient,
        amount: d.amount,
        timestamp: t.timestamp,
        confidence:
          "CONFIRMED_VIRTUAL_LEDGER_EVENT; FUND ATTRIBUTION NOT ESTABLISHED",
        evidence: {
          logId: l.id,
          blockId: l.blockId,
          reference: t.reference,
          simulation: true,
        },
      },
      update: {},
    });
  }
  const env = await tx.labEnvironment.findUniqueOrThrow({
      where: { id: environmentId },
    }),
    block = await tx.labBlock.findFirst({
      where: { environmentId, canonical: true },
      orderBy: { number: "desc" },
    });
  await tx.labCheckpoint.upsert({
    where: { environmentId },
    create: {
      environmentId,
      blockNumber: env.head,
      blockHash: block?.hash || "simulation-genesis",
      eventSequence: env.eventSequence,
    },
    update: {
      blockNumber: env.head,
      blockHash: block?.hash || "simulation-genesis",
      eventSequence: env.eventSequence,
    },
  });
  const invalid = await tx.labLog.findMany({
    where: { environmentId, status: "REORGANIZED" },
    select: { id: true },
  });
  await tx.labFlowEdge.deleteMany({
    where: { environmentId, logId: { in: invalid.map((l) => l.id) } },
  });
}
export async function reorg(tx: Tx, environmentId: string) {
  const block = await tx.labBlock.findFirst({
    where: { environmentId, canonical: true },
    orderBy: { number: "desc" },
  });
  if (!block) throw new Error("No virtual block to reorganize");
  const transactions = await tx.labTransaction.findMany({
    where: { blockId: block.id },
  });
  for (const t of transactions) {
    const entries = await tx.labLedger.findMany({
      where: { transactionId: t.id, kind: { not: "REORG_COMPENSATION" } },
      orderBy: { sequence: "desc" },
    });
    for (const e of entries) {
      const wallet = await tx.labWallet.findUniqueOrThrow({
        where: { id: e.walletId },
      });
      await journal(
        tx,
        environmentId,
        wallet.role,
        e.asset,
        -BigInt(e.delta.toFixed(0)),
        "REORG_COMPENSATION",
        t.id,
      );
    }
    await tx.labTransaction.update({
      where: { id: t.id },
      data: { status: "REORGANIZED", confirmations: 0 },
    });
    const execution = await tx.labExecution.findUnique({
      where: { transactionId: t.id },
    });
    if (execution)
      await tx.labExecution.update({
        where: { id: execution.id },
        data: {
          state: "REORGANIZED",
          receipt: {
            ...(execution.receipt as any),
            status: "REORGANIZED",
            confirmations: 0,
          },
        },
      });
    await tx.labWallet.update({
      where: { id: walletId(environmentId, "facilitator") },
      data: { transactionNonce: { decrement: 1 } },
    });
    await tx.labLog.updateMany({
      where: { transactionId: t.id },
      data: { status: "REORGANIZED" },
    });
    await tx.labSettlement.updateMany({
      where: { transactionId: t.id },
      data: { state: "REORGANIZED" },
    });
    if (t.purchaseId) {
      await tx.labPurchase.update({
        where: { id: t.purchaseId },
        data: {
          state: "REVIEW",
          error:
            "Virtual block reorganized. Funds reverted through compensating journal; manual review required.",
        },
      });
    }
    const signed = await tx.labSigning.findFirst({
      where: { id: t.authorizationRef },
    });
    if (signed)
      await tx.labNonce.deleteMany({ where: { signingId: signed.id } });
  }
  await tx.labBlock.update({
    where: { id: block.id },
    data: { canonical: false },
  });
  await tx.labEnvironment.update({
    where: { id: environmentId },
    data: { head: block.number - 1 },
  });
  await updateConfirmations(tx, environmentId, block.number - 1);
  await emit(tx, environmentId, "VIRTUAL_CHAIN_REORGANIZED", "blockchain", {
    removedBlock: block.hash,
    transactionReferences: transactions.map((t) => t.reference),
  });
  await index(tx, environmentId);
  return block;
}
