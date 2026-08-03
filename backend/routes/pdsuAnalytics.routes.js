import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  pdsuAnalyticsStatsController,
  exportPdsuAnalyticsController,
  searchPdsuAnalyticsController,
  listWithoutPdsuController,
  exportWithoutPdsuPdfController,
  listWithoutUltravncController,
  exportWithoutUltravncPdfController,
  exportActivePrintersPdfController,
} from "../controllers/pdsuAnalytics.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/stats", asyncHandler(pdsuAnalyticsStatsController));
router.get("/export-xlsx", asyncHandler(exportPdsuAnalyticsController));
router.get("/search", asyncHandler(searchPdsuAnalyticsController));
router.get("/missing", asyncHandler(listWithoutPdsuController));
router.get("/missing/export-pdf", asyncHandler(exportWithoutPdsuPdfController));
router.get("/without-ultravnc", asyncHandler(listWithoutUltravncController));
router.get("/without-ultravnc/export-pdf", asyncHandler(exportWithoutUltravncPdfController));
router.get("/printers/active/export-pdf", asyncHandler(exportActivePrintersPdfController));

export default router;
