import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { inventoryAnalyticsStatsController } from "../controllers/pdsuAnalytics.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/stats", asyncHandler(inventoryAnalyticsStatsController));

export default router;
