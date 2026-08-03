import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import { listProcessDetectionsController } from "../controllers/processDetections.controller.js";

const router = express.Router();

// Admin-only, uključujući čitanje - isti razlog kao dnsLogs.routes.js
// (osetljiv employee-monitoring podatak).
router.use(requireRole("admin"));

router.get("/", asyncHandler(listProcessDetectionsController));

export default router;
