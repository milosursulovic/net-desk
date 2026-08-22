import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  listReportsController,
  getLatestReportController,
  getReportByIdController,
  getReportPdfController,
  markReportReadController,
} from "../controllers/dailyReports.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// Mounted in protected.routes.js BEFORE the blanket write policy, since
// mark-read below needs to stay viewer-accessible (personal action, not a
// data mutation) rather than inheriting the default operator-and-up policy.
// Report generation itself has no HTTP route at all - only the 7am cron
// (dailyReportScheduler.js) triggers it now, manual on-demand generation
// was removed as unhelpful.
router.get("/", asyncHandler(listReportsController));
router.get("/latest", asyncHandler(getLatestReportController));
router.get("/:id", asyncHandler(getReportByIdController));
router.get("/:id/pdf", asyncHandler(getReportPdfController));
router.post("/:id/mark-read", asyncHandler(markReportReadController));

export default router;
