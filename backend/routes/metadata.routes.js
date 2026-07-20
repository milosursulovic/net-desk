import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  listMetadataController,
  statsController,
} from "../controllers/metadata.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listMetadataController));
router.get("/stats", asyncHandler(statsController));

export default router;
