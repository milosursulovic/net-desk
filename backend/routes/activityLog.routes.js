import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRootAdmin } from "../middlewares/requireRole.middleware.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { listActivityLogController } from "../controllers/activityLog.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// Samo nalog "admin", including reads - ko je šta radio je samo po sebi
// osetljivo, ista logika kao users.routes.js.
router.use(requireRootAdmin);

router.get("/", asyncHandler(listActivityLogController));

export default router;
