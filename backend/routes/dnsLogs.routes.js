import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  listDnsQueriesController,
  listFlaggedDomainsController,
  createFlaggedDomainController,
  deleteFlaggedDomainController,
} from "../controllers/dnsLogs.controller.js";

const router = express.Router();

// Admin-only, uključujući čitanje - istorija DNS upita zaposlenih je
// osetljiv employee-monitoring podatak (isti obrazac kao users.routes.js).
// Crna lista domena je smeštena ovde (ne u flagged.routes.js) baš zato što
// treba da nasledi ISTI admin-only nivo, za razliku od flagged_software/
// flagged_services koji su operator-writable.
router.use(requireRole("admin"));

router.get("/", asyncHandler(listDnsQueriesController));

router.get("/blacklist", asyncHandler(listFlaggedDomainsController));
router.post("/blacklist", asyncHandler(createFlaggedDomainController));
router.delete("/blacklist/:id", asyncHandler(deleteFlaggedDomainController));

export default router;
