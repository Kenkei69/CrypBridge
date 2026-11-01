import "dotenv/config";
import {config as loadSecretFile} from "dotenv";
import {simulationMode} from "./runtime";
if(!simulationMode())loadSecretFile({path:process.env.TESTNET_WALLET_ENV_FILE || ".secrets/testnet.env",quiet:true});
import { PrismaClient } from "@prisma/client";
export const db = new PrismaClient();
export const recipient = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
export const asset = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const defaultPolicy = {
  maxPayment: "1000000",
  dailyLimit: "10000000",
  sessionLimit: "5000000",
  approvalAbove: "500000",
  expectedPrice: "100000",
  deviationBps: 500,
  recipient,
  asset,
  network: "eip155:84532",
  scheme: "exact",
  service: "https://market.example.test/data",
  enabled: true,
};
