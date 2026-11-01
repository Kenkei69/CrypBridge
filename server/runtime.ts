import "dotenv/config";
export const simulationMode = () => process.env.CRYPBRIDGE_MODE !== "testnet";
