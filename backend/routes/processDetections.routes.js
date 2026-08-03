import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { readRequiresOperator } from "../middlewares/requireRole.middleware.js";
import { listProcessDetectionsController } from "../controllers/processDetections.controller.js";

const router = express.Router();

// Isti razlog kao dnsLogs.routes.js (osetljiv employee-monitoring podatak) -
// čitanje ograničeno na admin+operator, ne i viewer.
router.use(readRequiresOperator);

router.get("/", asyncHandler(listProcessDetectionsController));

export default router;
