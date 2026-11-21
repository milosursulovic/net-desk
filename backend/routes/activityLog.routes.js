import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRootAdmin } from "../middlewares/requireRole.middleware.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  listActivityLogController,
  exportActivityLogController,
} from "../controllers/activityLog.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// Only the "admin" account, including reads - who did what is inherently
// sensitive, same logic as users.routes.js.
router.use(requireRootAdmin);

router.get("/", asyncHandler(listActivityLogController));
// XLSX export with the same filters (category/date/user/action), no pagination.
// requireRootAdmin above applies here too - the audit export is only for the "admin" account.
router.get("/export", asyncHandler(exportActivityLogController));

export default router;
