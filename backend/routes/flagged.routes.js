import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  listFlaggedSoftwareController,
  createFlaggedSoftwareController,
  deleteFlaggedSoftwareController,
  listFlaggedServicesController,
  createFlaggedServiceController,
  deleteFlaggedServiceController,
} from "../controllers/flagged.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/software", asyncHandler(listFlaggedSoftwareController));
router.post("/software", asyncHandler(createFlaggedSoftwareController));
router.delete("/software/:id", asyncHandler(deleteFlaggedSoftwareController));

router.get("/services", asyncHandler(listFlaggedServicesController));
router.post("/services", asyncHandler(createFlaggedServiceController));
router.delete("/services/:id", asyncHandler(deleteFlaggedServiceController));

export default router;
