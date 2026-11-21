import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  uploadMiddleware,
  listDownloadsFolderController,
  uploadDownloadsFolderController,
  deleteDownloadsFolderController,
} from "../controllers/downloadsFolder.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// The whole folder is served publicly without auth (routes/index.js, /uploads/downloads
// static mount) - managing it (what lives there) is deliberately
// admin-only on every route, not just on delete as with flagged/agent-releases.
router.use(requireRole("admin"));

router.get("/", asyncHandler(listDownloadsFolderController));
router.post("/", uploadMiddleware, asyncHandler(uploadDownloadsFolderController));
router.delete("/:fileName", asyncHandler(deleteDownloadsFolderController));

export default router;
