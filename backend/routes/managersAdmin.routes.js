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
// "/jobs/:jobId/cancel" (drugi segment doslovno "jobs", ne broj) se nikad ne
// poklapa sa "/:managerId/jobs" (drugi segment doslovno "jobs" TREĆI put bi
// bio managerId koji ovde ne postoji) - isti obrazac kao agentsAdmin.routes.js.
router.post("/jobs/:jobId/cancel", asyncHandler(cancelManagerJobController));

export default router;
