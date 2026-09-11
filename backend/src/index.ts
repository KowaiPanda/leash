import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { mandatesRouter } from "./routes/mandate.js";
import { resourceRouter } from "./routes/resources.js";
import { payRouter } from "./routes/pay.js";

const app = express();
app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/mandates", mandatesRouter);
app.use("/api/pay", payRouter);
app.use(resourceRouter);
app.listen(config.port, async () => {
  console.log(`[leash] backend listening on http://localhost:${config.port}`);
});
