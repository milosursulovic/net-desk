import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  listMetadataController,
  statsController,
  searchMetadataController,
  listWithoutMetadataController,
  exportWithoutMetadataPdfController,
} from "../controllers/metadata.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listMetadataController));
router.get("/stats", asyncHandler(statsController));
router.get("/search", asyncHandler(searchMetadataController));
router.get("/missing", asyncHandler(listWithoutMetadataController));
router.get("/missing/export-pdf", asyncHandler(exportWithoutMetadataPdfController));

export default router;
