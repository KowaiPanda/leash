import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    console.warn(`[config] Missing env var ${name} — set it in backend/.env`);
    return "";
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  frontendOrigins: (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  hedera: {
    operatorId: required("HEDERA_OPERATOR_ID"),
    operatorKey: required("HEDERA_OPERATOR_KEY"),
    network: process.env.HEDERA_NETWORK ?? "testnet",
    topicId: process.env.HEDERA_HCS_TOPIC_ID ?? "",
  },

  blocky402: {
    baseUrl: process.env.BLOCKY402_BASE_URL ?? "https://api.testnet.blocky402.com",
    network: process.env.BLOCKY402_NETWORK ?? "hedera-testnet",
  },

  privy: {
    appId: process.env.PRIVY_APP_ID ?? "",
    appSecret: process.env.PRIVY_APP_SECRET ?? "",
    keyQuorumId: process.env.PRIVY_KEY_QUORUM_ID ?? "",
  },

  resourcePriceUsdc: Number(process.env.RESOURCE_PRICE_USDC ?? 0.1),
};