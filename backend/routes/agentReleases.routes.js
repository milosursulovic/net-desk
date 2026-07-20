import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  uploadMiddleware,
  createReleaseController,
  listReleasesController,
  setReleaseActiveController,
} from "../controllers/agentReleases.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listReleasesController));
router.post("/", uploadMiddleware, asyncHandler(createReleaseController));
router.patch("/:id", asyncHandler(setReleaseActiveController));

export default router;
