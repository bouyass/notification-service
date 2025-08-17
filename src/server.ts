import express from "express";
import swaggerUi from "swagger-ui-express";
import { openapiSpec } from "./docs/openapi";

import devices from "./routes/devices";
import topics from "./routes/topics";
import subscriptions from "./routes/subscriptions";
import notifications from "./routes/notifications";

const app = express();
app.use(express.json());

// Health
app.get("/v1/health", (_req, res) => res.json({ ok: true }));

app.use("/v1/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec))
app.get("/v1/openapi.json", (_req, res) => res.json(openapiSpec))

app.use("/v1/devices", devices);
app.use("/v1/topics", topics);
app.use("/v1/subscriptions", subscriptions);
app.use("/v1/notifications", notifications);

export const server = app.listen(3000, () => {
  console.log("🚀 Notification service running on :3000");
});