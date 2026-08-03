import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { readRequiresOperator } from "../middlewares/requireRole.middleware.js";
import {
  getLiveServerHealthController,
  listServerHealthHistoryController,
  auditGhostReferencesController,
  cleanGhostReferencesController,
} from "../controllers/serverHealth.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// Reading (live/history/ghost-audit) is open to admin+operator, not viewer;
// the destructive ghost-cleanup write stays admin-only.
router.use(readRequiresOperator);

router.get("/live", asyncHandler(getLiveServerHealthController));
router.get("/history", asyncHandler(listServerHealthHistoryController));
router.get("/ghost-audit", asyncHandler(auditGhostReferencesController));
router.post("/ghost-cleanup", asyncHandler(cleanGhostReferencesController));

export default router;
