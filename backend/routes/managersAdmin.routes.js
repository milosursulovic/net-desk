import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  createManagerJobController,
  listManagerJobsController,
  cancelManagerJobController,
} from "../controllers/managerJobs.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.post("/:managerId/jobs", asyncHandler(createManagerJobController));
router.get("/:managerId/jobs", asyncHandler(listManagerJobsController));
// "/jobs/:jobId/cancel" (second segment literally "jobs", not a number) never
// matches "/:managerId/jobs" (the second segment literally "jobs" would be the THIRD time
// managerId, which doesn't exist here) - same pattern as agentsAdmin.routes.js.
router.post("/jobs/:jobId/cancel", asyncHandler(cancelManagerJobController));

export default router;
