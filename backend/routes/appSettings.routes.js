import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  listSettingsController,
  updateSettingController,
} from "../controllers/appSettings.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// Admin-only for reads too - which features are toggled is itself an
// administrative concern, same reasoning as users.routes.js/activityLog.routes.js.
router.use(requireRole("admin"));

router.get("/", asyncHandler(listSettingsController));
router.patch("/", asyncHandler(updateSettingController));

export default router;
