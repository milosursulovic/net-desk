import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
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

router.get("/", asyncHandler(listReportsController));
router.get("/latest", asyncHandler(getLatestReportController));
router.post("/generate", asyncHandler(generateReportController));
router.get("/:id", asyncHandler(getReportByIdController));
router.get("/:id/pdf", asyncHandler(getReportPdfController));
router.post("/:id/mark-read", asyncHandler(markReportReadController));

export default router;
