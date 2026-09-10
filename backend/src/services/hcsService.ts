import {
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import { config } from "../config.js";

let client: Client | null = null;
let topicId: string | null = config.hedera.topicId || null;

function getClient(): Client {
  if (client) return client;
  if (!config.hedera.operatorId || !config.hedera.operatorKey) {
    throw new Error(
      "Hedera operator credentials missing."
    );
  }
  const c = config.hedera.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  c.setOperator(config.hedera.operatorId, PrivateKey.fromStringDer(config.hedera.operatorKey));
  client = c;
  return client;
}

//Creates the Leash audit-trail topic once. 
export async function ensureTopic(): Promise<string> {
  if (topicId) return topicId;
  const c = getClient();
  const tx = await new TopicCreateTransaction()
    .setTopicMemo("Leash mandate audit trail")
    .execute(c);
  const receipt = await tx.getReceipt(c);
  topicId = receipt.topicId!.toString();
  console.log(`  Created HCS topic: ${topicId}`);
  return topicId;
}

export type HcsSubmitResult = { seq: number; consensusTimestamp: string };

/**
 * Submits one mandate lifecycle event to HCS. The payload is small,
 * deterministic JSON so anyone with the topic id can independently replay
 * the full spend history from the public mirror node, without trusting
 * Leash's own database.
 */
export async function submitMandateEvent(payload: Record<string, unknown>): Promise<HcsSubmitResult> {
  const c = getClient();
  const id = await ensureTopic();
  const tx = await new TopicMessageSubmitTransaction({
    topicId: id,
    message: JSON.stringify(payload),
  }).execute(c);
  const receipt = await tx.getReceipt(c);
  const record = await tx.getRecord(c);
  return {
    seq: receipt.topicSequenceNumber?.toNumber() ?? -1,
    consensusTimestamp: record.consensusTimestamp?.toDate().toISOString() ?? new Date().toISOString(),
  };
}

export function mirrorNodeTopicUrl(): string {
  const net = config.hedera.network === "mainnet" ? "mainnet" : "testnet";
  return `https://${net}.mirrornode.hedera.com/api/v1/topics/${topicId}/messages`;
}