import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  uploadMiddleware,
  createReleaseController,
  listReleasesController,
  setReleaseActiveController,
} from "../controllers/agentReleases.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listReleasesController));
// Admin-only, not just operator - a bad release affects every managed
// machine that auto-updates, bigger blast radius than routine agent/IP ops.
router.post(
  "/",
  requireRole("admin"),
  uploadMiddleware,
  asyncHandler(createReleaseController),
);
router.patch("/:id", requireRole("admin"), asyncHandler(setReleaseActiveController));

export default router;
