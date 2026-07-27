import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  getLiveServerHealthController,
  listServerHealthHistoryController,
} from "../controllers/serverHealth.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// Admin-only, including reads - server internals (request rates, DB load,
// process memory) aren't something an operator/viewer needs, same
// reasoning as activity-log/users.
router.use(requireRole("admin"));

router.get("/live", asyncHandler(getLiveServerHealthController));
router.get("/history", asyncHandler(listServerHealthHistoryController));

export default router;
