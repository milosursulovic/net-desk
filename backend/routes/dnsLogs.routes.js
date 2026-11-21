import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { readRequiresOperator } from "../middlewares/requireRole.middleware.js";
import {
  listDnsQueriesController,
  listFlaggedDomainsController,
  createFlaggedDomainController,
  deleteFlaggedDomainController,
} from "../controllers/dnsLogs.controller.js";

const router = express.Router();

// Employees' DNS query history is sensitive employee-monitoring data, so
// reading is restricted to admin+operator (not viewer); writing (the domain
// blacklist) stays admin-only.
router.use(readRequiresOperator);

router.get("/", asyncHandler(listDnsQueriesController));

router.get("/blacklist", asyncHandler(listFlaggedDomainsController));
router.post("/blacklist", asyncHandler(createFlaggedDomainController));
router.delete("/blacklist/:id", asyncHandler(deleteFlaggedDomainController));

export default router;
