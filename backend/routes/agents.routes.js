import express from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  requireEnrollToken,
  authenticateAgent,
} from "../middlewares/agentAuth.middleware.js";
import {
  enrollController,
  heartbeatController,
  inventoryController,
  pingController,
} from "../controllers/agents.controller.js";
import {
  pollJobsController,
  submitJobResultController,
} from "../controllers/agentJobs.controller.js";
import {
  checkUpdateController,
  downloadUpdateController,
  reportUpdateController,
} from "../controllers/agentReleases.controller.js";

const router = express.Router();

const enrollLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

router.post(
  "/enroll",
  enrollLimiter,
  requireEnrollToken,
  asyncHandler(enrollController),
);
router.post("/heartbeat", authenticateAgent, asyncHandler(heartbeatController));
router.get("/ping", authenticateAgent, asyncHandler(pingController));
router.post("/inventory", authenticateAgent, asyncHandler(inventoryController));
router.get("/jobs", authenticateAgent, asyncHandler(pollJobsController));
router.post(
  "/jobs/:jobId/result",
  authenticateAgent,
  asyncHandler(submitJobResultController),
);
router.get("/update", authenticateAgent, asyncHandler(checkUpdateController));
router.get(
  "/update/download/:releaseId",
  authenticateAgent,
  asyncHandler(downloadUpdateController),
);
router.post("/update/report", authenticateAgent, asyncHandler(reportUpdateController));

export default router;
