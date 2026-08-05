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

// Ceo folder se javno servira bez auth-a (routes/index.js, /uploads/downloads
// static mount) - upravljanje njime (šta se tamo nalazi) je namerno
// admin-only na svakoj ruti, ne samo na delete-u kao kod flagged/agent-releases.
router.use(requireRole("admin"));

router.get("/", asyncHandler(listDownloadsFolderController));
router.post("/", uploadMiddleware, asyncHandler(uploadDownloadsFolderController));
router.delete("/:fileName", asyncHandler(deleteDownloadsFolderController));

export default router;
