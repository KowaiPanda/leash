import { Router } from "express";
import fetch from "node-fetch";
import { config } from "../config.js";
import { mandateGuard } from "../middleware/mandateGuard.js";
import { recordDecrement, appendEvent } from "../services/mandateService.js";
import { submitMandateEvent } from "../services/hcsService.js";
import { verifyPayment, settlePayment, buildPaymentRequirements } from "../services/facilitatorClient.js";

export const payRouter = Router();

const RESOURCE_PATH = "/api/premium-data";

/**
 * POST /api/pay
 * Body: { rail: "hedera" | "arc" }
 * Headers: X-Mandate-Id, X-Payment-Amount
 *
 * This is the single choke point described in the pitch: "the facilitator
 * checks remaining allowance before settling, so the cap is enforced by the
 * payment rail rather than by the agent's own good behaviour." mandateGuard
 * runs FIRST, before either settlement rail is touched. Rejections never
 * reach Blocky402 or Circle/Arc at all — no on-chain call is attempted for
 * a payment that violates the mandate, on either rail.
 */
payRouter.get("/rails", (_req, res) => {
  res.json({
    hedera: { rail: "hedera", live: true, network: config.blocky402.network },
  });
});

payRouter.post("/", mandateGuard(RESOURCE_PATH), async (req, res) => {
  const mandateId = (req as any).mandateId as string;
  const amount = (req as any).paymentAmount as number;
  const rail = (req.body?.rail as string) === "arc" ? "arc" : "hedera";

  try {
    let txHash: string;
    let network: string;
    let mocked = false;

    const paymentRequirements = buildPaymentRequirements(RESOURCE_PATH, amount);
    const paymentPayload = req.body?.paymentPayload ?? {
      x402Version: 2,
      accepted: paymentRequirements,
      payload: {},                       // real signature/authorization goes here once a real client signs it
      resource: { url: RESOURCE_PATH },
    };

    const verified = await verifyPayment({ paymentPayload, paymentRequirements });
    if (!verified.isValid) {
    return res.status(402).json({ error: "facilitator rejected payment", reason: verified.invalidReason });
    }
    const settled = await settlePayment({ paymentPayload, paymentRequirements });
    txHash = settled.transaction ?? "unknown";
    network = config.blocky402.network;

    recordDecrement(mandateId, amount);
    const { seq, consensusTimestamp } = await submitMandateEvent({
      type: "DECREMENT",
      mandateId,
      amount,
      rail,
      network,
      txHash,
      mocked,
    });
    appendEvent({
      mandateId,
      type: "DECREMENT",
      amount,
      hcsSeq: seq,
      hcsConsensusTimestamp: consensusTimestamp,
      txHash,
    });

    // fetch the actual resource now that payment has settled
    const resourceRes = await fetch(`http://localhost:${config.port}${RESOURCE_PATH}`, {
      headers: { "X-Payment-Verified": "true" },
    });
    const resourceBody = await resourceRes.json();

    res.json({
      approved: true,
      rail,
      mocked,
      txHash,
      network,
      resource: resourceBody,
    });
  } catch (err: any) {
    console.error("[pay] settlement failed:", err);
    const { seq, consensusTimestamp } = await submitMandateEvent({
      type: "REJECTED",
      mandateId,
      amount,
      reason: err.message,
    }).catch(() => ({ seq: null, consensusTimestamp: null }));
    appendEvent({
      mandateId,
      type: "REJECTED",
      amount,
      reason: err.message,
      hcsSeq: seq,
      hcsConsensusTimestamp: consensusTimestamp,
    });
    res.status(502).json({ error: "settlement failed", detail: err.message });
  }
});