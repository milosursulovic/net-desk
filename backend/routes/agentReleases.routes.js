import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  uploadMiddleware,
  createReleaseController,
  listReleasesController,
  setReleaseActiveController,
  updateReleaseNotesController,
  deleteReleaseController,
  updateReleaseGroupsController,
  listReleaseFilesController,
} from "../controllers/agentReleases.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listReleasesController));
// Read-only view of the files on disk (uploads/agent-releases) - admin-only,
// same level as upload/is-active below.
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
// Same admin-only level - notes stay editable after upload (unlike
// the version/file), same pattern as /:id/deployment-groups below.
router.patch("/:id/notes", requireRole("admin"), asyncHandler(updateReleaseNotesController));
// Same admin-only level - deliberately only for ALREADY deactivated versions
// (deleteReleaseService rejects an active one), see the note there.
router.delete("/:id", requireRole("admin"), asyncHandler(deleteReleaseController));
// Same admin-only level as upload/is-active - "widening" a rollout to new
// groups carries the same blast-radius risk as the upload itself.
router.patch("/:id/deployment-groups", requireRole("admin"), asyncHandler(updateReleaseGroupsController));

export default router;
