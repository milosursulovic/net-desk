import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";

import {
  listComputersController,
  getComputerController,
  clearPdsuController,
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
  exportComputerPdsuPdfController,
  listFlaggedExceptionsController,
  addFlaggedExceptionController,
  removeFlaggedExceptionController,
} from "../controllers/pdsu.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// Computers
router.get("/", asyncHandler(listComputersController));

router.get("/by-ip/:ip", asyncHandler(getComputerByIpController));

router.get("/:id", asyncHandler(getComputerController));

router.delete("/:id", requireRole("admin"), asyncHandler(clearPdsuController));

router.get("/:id/export-pdf", asyncHandler(exportComputerPdsuPdfController));

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

// Izuzeci od crne liste (po računaru) - "ovo NIJE neželjeno na OVOM
// računaru", ne dira globalni flag za sve ostale (vidi flagged.routes.js).
router.get("/:id/flagged-exceptions", asyncHandler(listFlaggedExceptionsController));
router.post("/:id/flagged-exceptions/:kind/:flaggedId", asyncHandler(addFlaggedExceptionController));
router.delete("/:id/flagged-exceptions/:kind/:flaggedId", asyncHandler(removeFlaggedExceptionController));

export default router;
