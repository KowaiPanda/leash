import { Router } from "express";
import { listAllEventsEnriched } from "../services/mandateService.js";
import { ensureTopic, mirrorNodeTopicUrl } from "../services/hcsService.js";

export const auditRouter = Router();

// The full trail — every ISSUED/DECREMENT/REJECTED/CEILING_RAISE_*/REVOKED
// event across every mandate, newest first. This is what the Audit Trail
// page renders; GET /api/mandates/:id already gives you one mandate's slice
// of this if you need it scoped instead.
auditRouter.get("/events", (_req, res) => {
  res.json(listAllEventsEnriched());
});

auditRouter.get("/mirror-url", async (_req, res) => {
  await ensureTopic().catch(() => {});
  res.json({ url: mirrorNodeTopicUrl() });
});