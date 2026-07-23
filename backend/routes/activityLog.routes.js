import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { listActivityLogController } from "../controllers/activityLog.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// Admin-only, including reads - who did what is itself sensitive, same
// reasoning as users.routes.js.
router.use(requireRole("admin"));

router.get("/", asyncHandler(listActivityLogController));

export default router;
