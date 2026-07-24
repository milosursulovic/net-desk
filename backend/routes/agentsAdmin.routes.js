import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  listAgentsController,
  agentFilterOptionsController,
  listComputersWithoutAgentController,
  getAgentController,
  revokeAgentController,
} from "../controllers/agents.controller.js";
import {
  createJobController,
  createBatchJobController,
  listJobsController,
} from "../controllers/agentJobs.controller.js";
import {
  setDeploymentGroupController,
  listUpdateLogController,
} from "../controllers/agentReleases.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listAgentsController));
router.get("/filter-options", asyncHandler(agentFilterOptionsController));
router.get("/without-agent-computers", asyncHandler(listComputersWithoutAgentController));
router.get("/:id", asyncHandler(getAgentController));
router.post("/:id/revoke", asyncHandler(revokeAgentController));

router.get("/:id/jobs", asyncHandler(listJobsController));
router.post("/:id/jobs", asyncHandler(createJobController));
// "/jobs/batch" and "/:id/jobs" never collide (different second segment),
// registration order doesn't matter.
router.post("/jobs/batch", asyncHandler(createBatchJobController));

router.patch("/:id/deployment-group", asyncHandler(setDeploymentGroupController));
router.get("/:id/update-log", asyncHandler(listUpdateLogController));

export default router;
