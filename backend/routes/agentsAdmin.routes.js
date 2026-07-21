import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  listAgentsController,
  listComputersWithoutAgentController,
  getAgentController,
  revokeAgentController,
} from "../controllers/agents.controller.js";
import {
  createJobController,
  listJobsController,
} from "../controllers/agentJobs.controller.js";
import {
  setDeploymentGroupController,
  listUpdateLogController,
} from "../controllers/agentReleases.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listAgentsController));
router.get("/without-agent-computers", asyncHandler(listComputersWithoutAgentController));
router.get("/:id", asyncHandler(getAgentController));
router.post("/:id/revoke", asyncHandler(revokeAgentController));

router.get("/:id/jobs", asyncHandler(listJobsController));
router.post("/:id/jobs", asyncHandler(createJobController));

router.patch("/:id/deployment-group", asyncHandler(setDeploymentGroupController));
router.get("/:id/update-log", asyncHandler(listUpdateLogController));

export default router;
