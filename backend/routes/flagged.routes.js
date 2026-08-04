import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  listFlaggedSoftwareController,
  createFlaggedSoftwareController,
  deleteFlaggedSoftwareController,
  listAgentsForFlaggedSoftwareController,
  listFlaggedServicesController,
  createFlaggedServiceController,
  deleteFlaggedServiceController,
  listAgentsForFlaggedServiceController,
  listFlaggedDriversController,
  createFlaggedDriverController,
  deleteFlaggedDriverController,
  listAgentsForFlaggedDriverController,
} from "../controllers/flagged.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/software", asyncHandler(listFlaggedSoftwareController));
router.post("/software", asyncHandler(createFlaggedSoftwareController));
router.delete("/software/:id", requireRole("admin"), asyncHandler(deleteFlaggedSoftwareController));
router.get("/software/:id/agents", asyncHandler(listAgentsForFlaggedSoftwareController));

router.get("/services", asyncHandler(listFlaggedServicesController));
router.post("/services", asyncHandler(createFlaggedServiceController));
router.delete("/services/:id", requireRole("admin"), asyncHandler(deleteFlaggedServiceController));
router.get("/services/:id/agents", asyncHandler(listAgentsForFlaggedServiceController));

router.get("/drivers", asyncHandler(listFlaggedDriversController));
router.post("/drivers", asyncHandler(createFlaggedDriverController));
router.delete("/drivers/:id", requireRole("admin"), asyncHandler(deleteFlaggedDriverController));
router.get("/drivers/:id/agents", asyncHandler(listAgentsForFlaggedDriverController));

export default router;
