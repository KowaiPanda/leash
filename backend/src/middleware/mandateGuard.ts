import type { Request, Response, NextFunction } from "express";
import { evaluateMandate } from "../services/mandateService.js";

/**
 * Every request that wants to spend against a mandate must carry:
 *   X-Mandate-Id: <mandate uuid>
 * This middleware is the payment-rail-side enforcement point: "the
 * facilitator checks remaining allowance before settling,
 * so the cap is enforced by the payment rail rather than by the agent's own
 * good behaviour." If this rejects, the request is never processed
 * and no on-chain call is even attempted for a payment that violates the mandate.
 */
export function mandateGuard(resourcePath: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const mandateId = req.header("X-Mandate-Id");
    const amountHeader = req.header("X-Payment-Amount");
    const amount = Number(amountHeader);

    if (!mandateId) {
      return res.status(400).json({ error: "missing X-Mandate-Id header" });
    }
    if (!amountHeader || Number.isNaN(amount)) {
      return res.status(400).json({ error: "missing/invalid X-Payment-Amount header" });
    }

    const decision = evaluateMandate(mandateId, resourcePath, amount);
    if (!decision.allowed) {
      return res.status(403).json({ error: "mandate rejected payment", reason: decision.reason });
    }

    // stash for downstream handlers
    (req as any).mandateId = mandateId;
    (req as any).paymentAmount = amount;
    next();
  };
}