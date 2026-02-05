import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getMetadataByIpController,
  upsertMetadataByIpController,
  patchMetadataByIpController,
} from "../controllers/ipAddressesMetadata.controller.js";

const router = express.Router();

router.post("/:ip/metadata", asyncHandler(upsertMetadataByIpController));
router.get("/:ip/metadata", asyncHandler(getMetadataByIpController));
router.patch("/:ip/metadata", asyncHandler(patchMetadataByIpController));

export default router;
