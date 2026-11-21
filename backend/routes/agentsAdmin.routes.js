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
  getAgentManagerStatusController,
  revokeAgentController,
  deleteAgentController,
  setProcessKillExemptController,
  addAgentDeploymentGroupController,
  removeAgentDeploymentGroupController,
  addAgentsDeploymentGroupController,
} from "../controllers/agents.controller.js";
import {
  createJobController,
  createBatchJobController,
  listJobsController,
  clearJobsController,
  getBatchStatusController,
  listJobBatchesController,
  cancelBatchController,
  cancelJobController,
} from "../controllers/agentJobs.controller.js";
import { listUpdateLogController } from "../controllers/agentReleases.controller.js";
import {
  startVncSessionController,
  endVncSessionController,
  getVncSessionController,
} from "../controllers/vncSessions.controller.js";
import { downloadFileFromAgentController } from "../controllers/fileTransfer.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listAgentsController));
// Must be registered BEFORE "/:id" below - "/:id" catches any single
// segment (including the literal "ids"), so it would otherwise shadow it.
router.get("/ids", asyncHandler(listAgentIdsController));
router.get("/filter-options", asyncHandler(agentFilterOptionsController));
router.get("/without-agent-computers", asyncHandler(listComputersWithoutAgentController));
router.get("/without-agent-computers/export-pdf", asyncHandler(exportComputersWithoutAgentPdfController));
router.get("/:id", asyncHandler(getAgentController));
router.get("/:id/manager-status", asyncHandler(getAgentManagerStatusController));
// Admin-only - revoking access is irreversible without a re-enroll on the
// machine, a bigger blast radius than routine operator actions.
router.post("/:id/revoke", requireRole("admin"), asyncHandler(revokeAgentController));
// Admin-only, and the service (deleteAgentService) itself requires the agent to ALREADY be
// 'revoked' - permanently deletes the row (CASCADE deletes jobs/monitoring/deployment
// groups), a bigger blast radius than revoke.
router.delete("/:id", requireRole("admin"), asyncHandler(deleteAgentController));

router.get("/:id/jobs", asyncHandler(listJobsController));
router.post("/:id/jobs", asyncHandler(createJobController));
router.delete("/:id/jobs", requireRole("admin"), asyncHandler(clearJobsController));
// "/jobs/batch(es)" and "/:id/jobs" never collide (different second
// segment), registration order doesn't matter.
router.post("/jobs/batch", asyncHandler(createBatchJobController));
router.get("/jobs/batch/:batchId", asyncHandler(getBatchStatusController));
router.post("/jobs/batch/:batchId/cancel", asyncHandler(cancelBatchController));
router.get("/jobs/batches", asyncHandler(listJobBatchesController));
// "/jobs/:jobId/cancel" (3 segments: jobs, :jobId, cancel) never
// matches "/jobs/batch/:batchId" (3 segments: jobs, batch, :batchId) - no
// real jobId nor "batch" can simultaneously be both the literal
// "batch" and the literal "cancel", so registration order doesn't matter.
router.post("/jobs/:jobId/cancel", asyncHandler(cancelJobController));

// Admin-only - deployment groups determine which release/version an agent gets
// (an agent can now have several - it matches if it has ANY of the targeted ones),
// a mistake here affects the update rollout for that machine.
router.post("/:id/deployment-groups", requireRole("admin"), asyncHandler(addAgentDeploymentGroupController));
router.delete("/:id/deployment-groups/:groupName", requireRole("admin"), asyncHandler(removeAgentDeploymentGroupController));
// "deployment-groups/batch" (2 segments, the second is "batch") and "/:id/deployment-groups"
// (second segment "deployment-groups") never match each other - same pattern
// as jobs/batch above, registration order doesn't matter.
router.post("/deployment-groups/batch", requireRole("admin"), asyncHandler(addAgentsDeploymentGroupController));
router.patch("/:id/process-kill-exempt", asyncHandler(setProcessKillExemptController));
router.get("/:id/update-log", asyncHandler(listUpdateLogController));

router.post("/:id/vnc/start", asyncHandler(startVncSessionController));
router.post("/:id/vnc/stop", asyncHandler(endVncSessionController));
// Status of a single session - the frontend polls while waiting for user consent, to
// detect 'rejected' (denied/timed out) and stop trying to connect.
// Same stricter threshold as viewing the VNC screen (admin/operator), not the router's
// GET default. "start"/"stop" are POST, so they can't collide with this GET.
router.get(
  "/:id/vnc/:sessionId",
  requireRole("admin", "operator"),
  asyncHandler(getVncSessionController),
);
// Explicit requireRole here even though it's a GET (the writeRequiresOperator default
// leaves GET open to the "viewer" role too) - same stricter threshold as viewing the
// VNC screen (see ws/vncRelay.js's authenticateViewer), not the router's
// default for plain reads. Upload is still gated more strictly (exactly
// "admin") inside ws/fileTransferRelay.js itself, because it goes over a WS message,
// not through an Express route that requireRole here could cover.
router.get(
  "/:id/file-transfer/:sessionId/download",
  requireRole("admin", "operator"),
  asyncHandler(downloadFileFromAgentController),
);

export default router;
