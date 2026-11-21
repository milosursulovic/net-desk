import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { readRequiresOperator } from "../middlewares/requireRole.middleware.js";
import { listProcessDetectionsController } from "../controllers/processDetections.controller.js";

const router = express.Router();

// Same reason as dnsLogs.routes.js (sensitive employee-monitoring data) -
// reading is restricted to admin+operator, not viewer.
router.use(readRequiresOperator);

router.get("/", asyncHandler(listProcessDetectionsController));

export default router;
