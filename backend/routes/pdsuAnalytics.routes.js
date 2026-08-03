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
} from "../controllers/pdsuAnalytics.controller.js";
import {
  listIgnoredPrinterPatternsController,
  createIgnoredPrinterPatternController,
  deleteIgnoredPrinterPatternController,
} from "../controllers/printerPatterns.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/stats", asyncHandler(pdsuAnalyticsStatsController));
router.get("/export-xlsx", asyncHandler(exportPdsuAnalyticsController));
router.get("/search", asyncHandler(searchPdsuAnalyticsController));
router.get("/missing", asyncHandler(listWithoutPdsuController));
router.get("/missing/export-pdf", asyncHandler(exportWithoutPdsuPdfController));
router.get("/without-ultravnc", asyncHandler(listWithoutUltravncController));
router.get("/without-ultravnc/export-pdf", asyncHandler(exportWithoutUltravncPdfController));

router.get("/printer-patterns", asyncHandler(listIgnoredPrinterPatternsController));
router.post("/printer-patterns", asyncHandler(createIgnoredPrinterPatternController));
router.delete("/printer-patterns/:id", asyncHandler(deleteIgnoredPrinterPatternController));

export default router;
