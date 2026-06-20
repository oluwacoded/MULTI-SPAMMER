import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// The VM deployment health check probes `/api`. Answer it with a cheap, always-200
// JSON response so a healthy server is never marked down (previously this fell
// through to the SPA fallback's file I/O, which could intermittently 500 and
// trigger an automatic restart / outage).
router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
