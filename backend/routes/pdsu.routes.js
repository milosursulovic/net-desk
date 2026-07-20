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
  getPrintersController,
  syncPrintersController,
  getAvailableUpdatesController,
  syncAvailableUpdatesController,
  getEventLogsController,
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

// Printers
router.get("/:id/printers", asyncHandler(getPrintersController));

router.post("/:id/printers/sync", asyncHandler(syncPrintersController));

// Available Updates
router.get("/:id/available-updates", asyncHandler(getAvailableUpdatesController));

router.post(
  "/:id/available-updates/sync",
  asyncHandler(syncAvailableUpdatesController),
);

// Event Log
router.get("/:id/event-logs", asyncHandler(getEventLogsController));

export default router;
