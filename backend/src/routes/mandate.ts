import { Router } from "express";
import {
  createMandate,
  getMandate,
  listMandates,
  listEvents,
  appendEvent,
  setIssuanceSeq,
  revokeMandate,
  raiseCeiling,  
  setPendingCeilingRaise,
  clearPendingCeilingRaise,
} from "../services/mandateService.js";
import { submitMandateEvent } from "../services/hcsService.js";
import { canonicalMandatePayload, raiseCeilingWithSignatures } from "../services/privyService.js";

export const mandatesRouter = Router();

// List all mandates
mandatesRouter.get("/", (_req, res) => {
  res.json(listMandates());
});

// Get one mandate + its event log
mandatesRouter.get("/:id", (req, res) => {
  const mandate = getMandate(req.params.id);
  if (!mandate) return res.status(404).json({ error: "not found" });
  res.json({ mandate, events: listEvents(mandate.id) });
});

// Issue a new mandate
mandatesRouter.post("/", async (req, res) => {
  const { agentId, issuerUserId, scope, ceiling, rateLimit, expiresAt } = req.body ?? {};
  if (!agentId || !issuerUserId || !Array.isArray(scope) || !ceiling || !rateLimit || !expiresAt) {
    return res.status(400).json({
      error:
        "expected { agentId, issuerUserId, scope: string[], ceiling: number, rateLimit: {maxAmount, windowSeconds}, expiresAt: ISOString }",
    });
  }

  const canonical = canonicalMandatePayload({ agentId, scope, ceiling, rateLimit, expiresAt });
  const issuerSignature = `stub-signature:${Buffer.from(canonical).toString("base64").slice(0, 24)}`;

  const mandate = createMandate({
    agentId,
    issuerUserId,
    scope,
    ceiling,
    rateLimit,
    expiresAt,
    issuerSignature,
  });

  try {
    const { seq, consensusTimestamp } = await submitMandateEvent({
      type: "ISSUED",
      mandateId: mandate.id,
      agentId,
      scope,
      ceiling,
      rateLimit,
      expiresAt,
      issuerSignature,
    });
    setIssuanceSeq(mandate.id, seq);
    appendEvent({
      mandateId: mandate.id,
      type: "ISSUED",
      hcsSeq: seq,
      hcsConsensusTimestamp: consensusTimestamp,
    });
  } catch (e) {
    console.error("[mandates] HCS submit failed (mandate still created locally):", e);
  }

  res.status(201).json(getMandate(mandate.id));
});

//Revoke a mandate
mandatesRouter.post("/:id/revoke", async (req, res) => {
  const mandate = getMandate(req.params.id);
  if (!mandate) return res.status(404).json({ error: "not found" });
  revokeMandate(mandate.id);
  try {
    const { seq, consensusTimestamp } = await submitMandateEvent({
      type: "REVOKED",
      mandateId: mandate.id,
    });
    appendEvent({ mandateId: mandate.id, type: "REVOKED", hcsSeq: seq, hcsConsensusTimestamp: consensusTimestamp });
  } catch (e) {
    console.error("[mandates] HCS submit failed:", e);
  }
  res.json(getMandate(mandate.id));
});

// Raise the ceiling. If PRIVY_CEILING_POLICY_ID + two authorization private
// keys are configured, this is signed by both keys and submitted to Privy
// synchronously (see raiseCeilingWithSignatures) — it either succeeds or
// throws in one round trip, no pending/polling state.
mandatesRouter.post("/:id/raise-ceiling", async (req, res) => {
  const mandate = getMandate(req.params.id);
  if (!mandate) return res.status(404).json({ error: "not found" });
  const { newCeiling } = req.body ?? {};
  if (typeof newCeiling !== "number" || newCeiling <= mandate.ceiling) {
    return res.status(400).json({ error: "newCeiling must be a number greater than the current ceiling" });
  }
 
  const { seq, consensusTimestamp } = await submitMandateEvent({
    type: "CEILING_RAISE_PROPOSED",
    mandateId: mandate.id,
    newCeiling,
  });
  appendEvent({
    mandateId: mandate.id,
    type: "CEILING_RAISE_PROPOSED",
    amount: newCeiling,
    hcsSeq: seq,
    hcsConsensusTimestamp: consensusTimestamp,
  });
 
  if (process.env.PRIVY_CEILING_POLICY_ID && process.env.PRIVY_AUTH_KEY_1 && process.env.PRIVY_AUTH_KEY_2) {
    try {
      await raiseCeilingWithSignatures(process.env.PRIVY_CEILING_POLICY_ID, newCeiling, [
        process.env.PRIVY_AUTH_KEY_1,
        process.env.PRIVY_AUTH_KEY_2,
      ]);
    } catch (e: any) {
      return res.status(502).json({ error: "Privy quorum-signed ceiling raise failed", detail: e.message });
    }
  }
 
  raiseCeiling(mandate.id, newCeiling);
  const { seq: seq2, consensusTimestamp: ts2 } = await submitMandateEvent({
    type: "CEILING_RAISE_EXECUTED",
    mandateId: mandate.id,
    newCeiling,
  });
  appendEvent({
    mandateId: mandate.id,
    type: "CEILING_RAISE_EXECUTED",
    amount: newCeiling,
    hcsSeq: seq2,
    hcsConsensusTimestamp: ts2,
  });
 
  res.json(getMandate(mandate.id));
});