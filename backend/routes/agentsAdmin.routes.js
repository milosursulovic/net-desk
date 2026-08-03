import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  listAgentsController,
  listAgentIdsController,
  agentFilterOptionsController,
  listComputersWithoutAgentController,
  exportComputersWithoutAgentPdfController,
  getAgentController,
  revokeAgentController,
  setProcessKillExemptController,
} from "../controllers/agents.controller.js";
import {
  createJobController,
  createBatchJobController,
  listJobsController,
  clearJobsController,
  getBatchStatusController,
  listJobBatchesController,
} from "../controllers/agentJobs.controller.js";
import {
  setDeploymentGroupController,
  listUpdateLogController,
} from "../controllers/agentReleases.controller.js";
import {
  startVncSessionController,
  endVncSessionController,
} from "../controllers/vncSessions.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listAgentsController));
// Mora biti registrovano PRE "/:id" ispod - "/:id" hvata bilo koji jedan
// segment (uključujući bukvalno "ids"), pa bi ga inače zasenio.
router.get("/ids", asyncHandler(listAgentIdsController));
router.get("/filter-options", asyncHandler(agentFilterOptionsController));
router.get("/without-agent-computers", asyncHandler(listComputersWithoutAgentController));
router.get("/without-agent-computers/export-pdf", asyncHandler(exportComputersWithoutAgentPdfController));
router.get("/:id", asyncHandler(getAgentController));
router.post("/:id/revoke", asyncHandler(revokeAgentController));

router.get("/:id/jobs", asyncHandler(listJobsController));
router.post("/:id/jobs", asyncHandler(createJobController));
router.delete("/:id/jobs", asyncHandler(clearJobsController));
// "/jobs/batch(es)" and "/:id/jobs" never collide (different second
// segment), registration order doesn't matter.
router.post("/jobs/batch", asyncHandler(createBatchJobController));
router.get("/jobs/batch/:batchId", asyncHandler(getBatchStatusController));
router.get("/jobs/batches", asyncHandler(listJobBatchesController));

router.patch("/:id/deployment-group", asyncHandler(setDeploymentGroupController));
router.patch("/:id/process-kill-exempt", asyncHandler(setProcessKillExemptController));
router.get("/:id/update-log", asyncHandler(listUpdateLogController));

router.post("/:id/vnc/start", asyncHandler(startVncSessionController));
router.post("/:id/vnc/stop", asyncHandler(endVncSessionController));

export default router;
