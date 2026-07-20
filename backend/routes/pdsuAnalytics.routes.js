import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { inventoryAnalyticsStatsController } from "../controllers/pdsuAnalytics.controller.js";

const router = express.Router();

router.get("/stats", asyncHandler(inventoryAnalyticsStatsController));

export default router;
