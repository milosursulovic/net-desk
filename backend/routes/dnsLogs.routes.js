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

// Istorija DNS upita zaposlenih je osetljiv employee-monitoring podatak, pa
// je čitanje ograničeno na admin+operator (ne i viewer); pisanje (crna
// lista domena) ostaje isključivo admin.
router.use(readRequiresOperator);

router.get("/", asyncHandler(listDnsQueriesController));

router.get("/blacklist", asyncHandler(listFlaggedDomainsController));
router.post("/blacklist", asyncHandler(createFlaggedDomainController));
router.delete("/blacklist/:id", asyncHandler(deleteFlaggedDomainController));

export default router;
