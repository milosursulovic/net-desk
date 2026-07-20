import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  pdsuAnalyticsStatsController,
  exportPdsuAnalyticsController,
  searchPdsuAnalyticsController,
} from "../controllers/pdsuAnalytics.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/stats", asyncHandler(pdsuAnalyticsStatsController));
router.get("/export-xlsx", asyncHandler(exportPdsuAnalyticsController));
router.get("/search", asyncHandler(searchPdsuAnalyticsController));

export default router;
