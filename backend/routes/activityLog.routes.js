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

// Samo nalog "admin", including reads - ko je šta radio je samo po sebi
// osetljivo, ista logika kao users.routes.js.
router.use(requireRootAdmin);

router.get("/", asyncHandler(listActivityLogController));
// XLSX export istih filtera (kategorija/datum/korisnik/akcija), bez paginacije.
// requireRootAdmin iznad vazi i ovde - audit export je samo za nalog "admin".
router.get("/export", asyncHandler(exportActivityLogController));

export default router;
