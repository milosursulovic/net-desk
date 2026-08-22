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
  getVncSignalingLogController,
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
router.get("/:id/manager-status", asyncHandler(getAgentManagerStatusController));
// Admin-only - povlačenje pristupa je nepovratno bez ponovnog enroll-a na
// mašini, veći blast radius od rutinskih operator akcija.
router.post("/:id/revoke", requireRole("admin"), asyncHandler(revokeAgentController));
// Admin-only, i servis (deleteAgentService) sam zahteva da agent VEĆ bude
// 'revoked' - trajno briše red (CASCADE briše jobs/monitoring/deployment
// grupe), veći blast radius nego revoke.
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
// "/jobs/:jobId/cancel" (3 segmenta: jobs, :jobId, cancel) se nikad ne
// poklapa sa "/jobs/batch/:batchId" (3 segmenta: jobs, batch, :batchId) - ni
// jedan pravi jobId niti "batch" ne mogu istovremeno da budu i doslovno
// "batch" i doslovno "cancel", registracioni redosled nije bitan.
router.post("/jobs/:jobId/cancel", asyncHandler(cancelJobController));

// Admin-only - deployment grupe određuju koji release/verzija agent dobija
// (agent sad može imati više njih - pogađa ako ima BILO KOJU od ciljanih),
// greška ovde pogađa update rollout za tu mašinu.
router.post("/:id/deployment-groups", requireRole("admin"), asyncHandler(addAgentDeploymentGroupController));
router.delete("/:id/deployment-groups/:groupName", requireRole("admin"), asyncHandler(removeAgentDeploymentGroupController));
// "deployment-groups/batch" (2 segmenta, drugi je "batch") i "/:id/deployment-groups"
// (drugi segment "deployment-groups") se nikad ne poklapaju - isti obrazac
// kao jobs/batch iznad, registracioni redosled nije bitan.
router.post("/deployment-groups/batch", requireRole("admin"), asyncHandler(addAgentsDeploymentGroupController));
router.patch("/:id/process-kill-exempt", asyncHandler(setProcessKillExemptController));
router.get("/:id/update-log", asyncHandler(listUpdateLogController));

router.post("/:id/vnc/start", asyncHandler(startVncSessionController));
router.post("/:id/vnc/stop", asyncHandler(endVncSessionController));
// Dijagnostički alat - čita vnc_webrtc_signaling audit log (uključujući
// WebRtcBridge.exe-ove {"type":"log"} poruke, videti servis napomenu).
router.get("/:id/vnc/:sessionId/signaling-log", asyncHandler(getVncSignalingLogController));

export default router;
