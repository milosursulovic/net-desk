import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import { listDnsQueriesController } from "../controllers/dnsLogs.controller.js";

const router = express.Router();

// Admin-only, uključujući čitanje - istorija DNS upita zaposlenih je
// osetljiv employee-monitoring podatak (isti obrazac kao users.routes.js).
router.use(requireRole("admin"));

router.get("/", asyncHandler(listDnsQueriesController));

export default router;
