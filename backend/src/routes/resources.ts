import { Router } from "express";
import { config } from "../config.js";
import { buildPaymentRequirements } from "../services/facilitatorClient.js";

export const resourceRouter = Router();

const RESOURCE_PATH = "/api/premium-data";

/**
 * A minimal x402-gated resource. First request (no payment proof) gets a
 * 402 describing price + where to pay. Real payment/settlement happens via
 * routes/pay.ts (the facilitator-proxy) 
 */
resourceRouter.get(RESOURCE_PATH, (req, res) => {
  const paid = req.header("X-Payment-Verified") === "true";
  if (!paid) {
    res.setHeader(
      "PAYMENT-REQUIRED",
      Buffer.from(JSON.stringify(buildPaymentRequirements(RESOURCE_PATH, config.resourcePriceUsdc))).toString(
        "base64"
      )
    );
    return res.status(402).json({
      error: "payment required",
      requirements: buildPaymentRequirements(RESOURCE_PATH, config.resourcePriceUsdc),
    });
  }

  res.json({
    resource: RESOURCE_PATH,
    data: { headline: "Premium market data", value: Math.round(Math.random() * 10000) / 100 },
    servedAt: new Date().toISOString(),
  });
});

export const RESOURCE_PATH_CONST = RESOURCE_PATH;