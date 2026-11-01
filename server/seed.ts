import { seedSimulation } from "./simulation-seed";
import { db, defaultPolicy } from "./config";
import { fixture, validate } from "./engine";
import { assess } from "./attacks";
if (!(await db.wallet.count())) {
  const wallet = await db.wallet.create({
    data: {
      name: "Agent treasury",
      address: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    },
  });
  const agent = await db.agent.create({
    data: { name: "Atlas research agent", walletId: wallet.id },
  });
  await db.policy.create({ data: { version: 1, config: defaultPolicy } });
  const secure = await db.guard.create({
    data: { name: "Sentinel · native guard", endpoint: "builtin:secure" },
  });
  const weak = await db.guard.create({
    data: {
      name: "Permissive · vulnerable demo",
      endpoint: "builtin:vulnerable",
    },
  });
  await validate(fixture(agent.id));
  await assess(secure.id);
  await assess(weak.id);
  console.log("Demo seeded");
}
await seedSimulation();
await db.$disconnect();
