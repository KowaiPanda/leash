import {
  TransferTransaction,
  TransactionId,
  AccountId,
  TokenId,
  PrivateKey,
} from "@hashgraph/sdk";

/**
 * Builds the base64-encoded, partially-signed TransferTransaction the
 * Hedera x402 "exact" scheme expects as `payload.transaction`. The agent
 * (payer) signs; the facilitator's feePayer signs later at /settle and
 * submits.
 */
export async function buildHederaExactPayload(params: {
  agentAccountId: string;
  agentPrivateKeyDer: string;
  payToAccountId: string;
  feePayerAccountId: string;
  tokenId: string;
  amountSmallestUnit: number;
  nodeAccountId?: string;
}): Promise<string> {
  const nodeId = AccountId.fromString(params.nodeAccountId ?? "0.0.3");

  const tx = new TransferTransaction()
    .addTokenTransfer(
      TokenId.fromString(params.tokenId),
      AccountId.fromString(params.agentAccountId),
      -params.amountSmallestUnit
    )
    .addTokenTransfer(
      TokenId.fromString(params.tokenId),
      AccountId.fromString(params.payToAccountId),
      params.amountSmallestUnit
    )
    .setTransactionId(TransactionId.generate(AccountId.fromString(params.feePayerAccountId)))
    .setNodeAccountIds([nodeId])
    .freeze();

  const signed = await tx.sign(PrivateKey.fromStringDer(params.agentPrivateKeyDer));
  return Buffer.from(signed.toBytes()).toString("base64");
}