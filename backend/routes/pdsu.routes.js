import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";

import {
  listComputersController,
  getComputerController,
  getSoftwareController,
  syncSoftwareController,
  getDriversController,
  syncDriversController,
  getServicesController,
  syncServicesController,
  getUpdatesController,
  syncUpdatesController,
  getComputerByIpController,
} from "../controllers/pdsu.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// Computers
router.get("/", asyncHandler(listComputersController));

router.get("/by-ip/:ip", asyncHandler(getComputerByIpController));

router.get("/:id", asyncHandler(getComputerController));

// Software
router.get("/:id/software", asyncHandler(getSoftwareController));

router.post("/:id/software/sync", asyncHandler(syncSoftwareController));

// Drivers
router.get("/:id/drivers", asyncHandler(getDriversController));

router.post("/:id/drivers/sync", asyncHandler(syncDriversController));

// Services
router.get("/:id/services", asyncHandler(getServicesController));

router.post("/:id/services/sync", asyncHandler(syncServicesController));

// Updates
router.get("/:id/updates", asyncHandler(getUpdatesController));

router.post("/:id/updates/sync", asyncHandler(syncUpdatesController));

export default router;
