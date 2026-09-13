import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { ensureTopic } from "./services/hcsService.js";
import { mandatesRouter } from "./routes/mandate.js";
import { resourceRouter } from "./routes/resources.js";
import { payRouter } from "./routes/pay.js";
import { auditRouter } from "./routes/audit.js";

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      // origin is undefined for same-origin/non-browser requests (curl, server-to-server) — allow those.
      if (!origin || config.frontendOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[cors] rejected origin: ${origin} (allowed: ${config.frontendOrigins.join(", ")})`);
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/mandates", mandatesRouter);
app.use("/api/pay", payRouter);
app.use("/api/audit", auditRouter);
app.use(resourceRouter);

app.listen(config.port, async () => {
  console.log(`[leash] backend listening on http://localhost:${config.port}`);
  try {
    await ensureTopic();
  } catch (e: any) {
    console.warn(
      "[leash] Could not initialize HCS topic yet — set HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY in .env.\n" +
        `        (${e.message})`
    );
  }
});
