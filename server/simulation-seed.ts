import { db, asset, recipient } from "./config";
import { demoUser } from "./security";
export const guardianDefaults = {
  enabled: true,
  maxPayment: "10000000",
  dailyLimit: "100000000",
  sessionLimit: "100000000",
  allowedNetwork: "eip155:84532",
  allowedAsset: asset,
  allowContractCalls: false,
};
export async function seedSimulation() {
  await demoUser();
  await db.merchant.upsert({
    where: { id: "atlas" },
    create: {
      id: "atlas",
      name: "Atlas Research",
      recipient,
      asset,
      network: "eip155:84532",
    },
    update: {name:"Atlas Research"},
  });
  for (const r of [
    {
      id: "research-report",
      name: "Research report",
      description:"AI security research on protecting autonomous payments.",
      price: "1000000",
      keywords: ["research", "report"],
      content:
        "Research report: AI payment security. Trusted user intent, bounded signing permissions, and atomic settlement protect autonomous purchases.",
    },
    {id:"agent-wallet-report",name:"Agent wallet security report",price:"1500000",keywords:["research","report","security","agent","wallet"],description:"A practical guide to securing AI-agent payment permissions.",content:"Agent wallet security report: verify trusted intent, isolate signing, and bound every permission."},
    {id:"payment-threat-report",name:"AI payment threat assessment",price:"2500000",keywords:["research","report","security","payment","ai"],description:"A review of payment manipulation and transaction-layer defenses.",content:"AI payment threat assessment: amount substitution, recipient tampering, replay protection, and safe settlement."},
    {
      id: "premium-article",
      name: "Premium article",
      price: "500000",
      keywords: ["article"],
      content:
        "Premium article: Building a trustworthy autonomous economy requires independent authorization.",
    },
    {
      id: "weather-data",
      name: "Weather API data",
      price: "2000000",
      keywords: ["weather"],
      content:
        "Weather dataset: temperature 21 C, conditions clear. Demonstration data, not a live forecast.",
    },
    {
      id: "image-generation",
      name: "AI image generation",
      price: "3000000",
      keywords: ["image"],
      content:
        "Image resource: an abstract blue shield illustration specification. No paid image API was invoked.",
    },
  ])
    await db.mockResource.upsert({
      where: { id: r.id },
      create: { ...r, merchantId: "atlas" },
      update: {},
    });
  if (!(await db.guardianPolicy.count()))
    await db.guardianPolicy.create({
      data: { version: 1, config: guardianDefaults },
    });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9402)`;
    await tx.mockAccount.upsert({
      where: { id: "mock-faucet" },
      create: { id: "mock-faucet", address: "mock:faucet", balance: "0" },
      update: {},
    });
    await tx.mockAccount.upsert({
      where: { id: "merchant-atlas" },
      create: { id: "merchant-atlas", address: recipient, balance: "0" },
      update: {},
    });
    if (!(await tx.mockAccount.findUnique({ where: { id: "buyer-demo" } }))) {
      await tx.mockAccount.create({
        data: {
          id: "buyer-demo",
          address: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
          balance: "1000000000",
        },
      });
      await tx.mockTransfer.create({
        data: {
          fromId: "mock-faucet",
          toId: "buyer-demo",
          amount: "1000000000",
          kind: "initial_mock_funding",
        },
      });
    }
  });
}
