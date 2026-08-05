import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  uploadMiddleware,
  createReleaseController,
  listReleasesController,
  setReleaseActiveController,
  updateReleaseGroupsController,
  listReleaseFilesController,
} from "../controllers/agentReleases.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listReleasesController));
// Read-only uvid u fajlove na disku (uploads/agent-releases) - admin-only,
// isti nivo kao upload/is-active dole.
router.get("/files", requireRole("admin"), asyncHandler(listReleaseFilesController));
// Admin-only, not just operator - a bad release affects every managed
// machine that auto-updates, bigger blast radius than routine agent/IP ops.
router.post(
  "/",
  requireRole("admin"),
  uploadMiddleware,
  asyncHandler(createReleaseController),
);
router.patch("/:id", requireRole("admin"), asyncHandler(setReleaseActiveController));
// Isti admin-only nivo kao upload/is-active - "širenje" rollout-a na nove
// grupe je isti blast-radius rizik kao sam upload.
router.patch("/:id/deployment-groups", requireRole("admin"), asyncHandler(updateReleaseGroupsController));

export default router;
