import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { listMetadataController, statsController } from "../controllers/metadata.controller.js";

const router = express.Router();

router.get("/", asyncHandler(listMetadataController));
router.get("/stats", asyncHandler(statsController));

export default router;
