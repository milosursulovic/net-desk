import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  listReportsController,
  getLatestReportController,
  getReportByIdController,
  getReportPdfController,
  generateReportController,
  markReportReadController,
} from "../controllers/dailyReports.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// Mounted in protected.routes.js BEFORE the blanket write policy, since
// mark-read below needs to stay viewer-accessible - generate needs its own
// explicit check here instead of inheriting the default.
router.get("/", asyncHandler(listReportsController));
router.get("/latest", asyncHandler(getLatestReportController));
router.post("/generate", requireRole("admin", "operator"), asyncHandler(generateReportController));
router.get("/:id", asyncHandler(getReportByIdController));
router.get("/:id/pdf", asyncHandler(getReportPdfController));
router.post("/:id/mark-read", asyncHandler(markReportReadController));

export default router;
