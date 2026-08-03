import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  listMetadataController,
  statsController,
  searchMetadataController,
  listWithoutMetadataController,
  exportWithoutMetadataPdfController,
  clearMetadataController,
  exportComputerMetadataPdfController,
} from "../controllers/metadata.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listMetadataController));
router.get("/stats", asyncHandler(statsController));
router.get("/search", asyncHandler(searchMetadataController));
router.get("/missing", asyncHandler(listWithoutMetadataController));
router.get("/missing/export-pdf", asyncHandler(exportWithoutMetadataPdfController));
// Registered AFTER the static /missing* routes above - a param route like
// this would otherwise shadow them (":ipEntryId" happily matches the
// literal string "missing").
router.get("/:ipEntryId/export-pdf", asyncHandler(exportComputerMetadataPdfController));
router.delete("/:ipEntryId", requireRole("admin"), asyncHandler(clearMetadataController));

export default router;
