import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  listAgentsController,
  listAgentIdsController,
  agentFilterOptionsController,
  listComputersWithoutAgentController,
  exportComputersWithoutAgentPdfController,
  getAgentController,
  revokeAgentController,
  setProcessKillExemptController,
  addAgentGroupController,
  removeAgentGroupController,
  addAgentDeploymentGroupController,
  removeAgentDeploymentGroupController,
} from "../controllers/agents.controller.js";
import {
  createJobController,
  createBatchJobController,
  listJobsController,
  clearJobsController,
  getBatchStatusController,
  listJobBatchesController,
  cancelBatchController,
} from "../controllers/agentJobs.controller.js";
import { listUpdateLogController } from "../controllers/agentReleases.controller.js";
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
// Admin-only - povlačenje pristupa je nepovratno bez ponovnog enroll-a na
// mašini, veći blast radius od rutinskih operator akcija.
router.post("/:id/revoke", requireRole("admin"), asyncHandler(revokeAgentController));

router.get("/:id/jobs", asyncHandler(listJobsController));
router.post("/:id/jobs", asyncHandler(createJobController));
router.delete("/:id/jobs", requireRole("admin"), asyncHandler(clearJobsController));
// "/jobs/batch(es)" and "/:id/jobs" never collide (different second
// segment), registration order doesn't matter.
router.post("/jobs/batch", asyncHandler(createBatchJobController));
router.get("/jobs/batch/:batchId", asyncHandler(getBatchStatusController));
router.post("/jobs/batch/:batchId/cancel", asyncHandler(cancelBatchController));
router.get("/jobs/batches", asyncHandler(listJobBatchesController));

// Admin-only - deployment grupe određuju koji release/verzija agent dobija
// (agent sad može imati više njih - pogađa ako ima BILO KOJU od ciljanih),
// greška ovde pogađa update rollout za tu mašinu.
router.post("/:id/deployment-groups", requireRole("admin"), asyncHandler(addAgentDeploymentGroupController));
router.delete("/:id/deployment-groups/:groupName", requireRole("admin"), asyncHandler(removeAgentDeploymentGroupController));
router.patch("/:id/process-kill-exempt", asyncHandler(setProcessKillExemptController));
// Operator nivo, isto kao process-kill-exempt iznad - za razliku od
// deployment-groups, ne utiče na update rollout.
router.post("/:id/groups", asyncHandler(addAgentGroupController));
router.delete("/:id/groups/:groupName", asyncHandler(removeAgentGroupController));
router.get("/:id/update-log", asyncHandler(listUpdateLogController));

router.post("/:id/vnc/start", asyncHandler(startVncSessionController));
router.post("/:id/vnc/stop", asyncHandler(endVncSessionController));

export default router;
