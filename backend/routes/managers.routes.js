import express from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  requireManagerEnrollToken,
  authenticateManager,
} from "../middlewares/managerAuth.middleware.js";
import { enrollController, heartbeatController } from "../controllers/managers.controller.js";
import {
  pollManagerJobsController,
  submitManagerJobResultController,
} from "../controllers/managerJobs.controller.js";
import { downloadUpdateForManagerController } from "../controllers/agentReleases.controller.js";

const router = express.Router();

const enrollLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

router.post("/enroll", enrollLimiter, requireManagerEnrollToken, asyncHandler(enrollController));
router.post("/heartbeat", authenticateManager, asyncHandler(heartbeatController));
router.get("/jobs", authenticateManager, asyncHandler(pollManagerJobsController));
router.post(
  "/jobs/:jobId/result",
  authenticateManager,
  asyncHandler(submitManagerJobResultController),
);
router.get(
  "/update/download/:releaseId",
  authenticateManager,
  asyncHandler(downloadUpdateForManagerController),
);

export default router;
