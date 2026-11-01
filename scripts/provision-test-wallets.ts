import { mkdir, open } from "node:fs/promises";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
// Exclusive create and owner-only permissions. Never prints secret material.
await mkdir(".secrets", { recursive: true, mode: 0o700 });
const file = await open(".secrets/testnet.env", "wx", 0o600);
try {
  const rows = [];
  for (const role of ["BUYER", "MERCHANT", "ATTACKER"]) {
    const key = generatePrivateKey(),
      address = privateKeyToAccount(key).address;
    rows.push(`${role}_PRIVATE_KEY=${key}`, `${role}_ADDRESS=${address}`);
    console.log(`${role}_ADDRESS=${address}`);
  }
  await file.writeFile(rows.join("\n") + "\n");
} finally {
  await file.close();
}
