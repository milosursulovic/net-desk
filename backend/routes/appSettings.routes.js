import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRootAdmin } from "../middlewares/requireRole.middleware.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  listSettingsController,
  updateSettingController,
} from "../controllers/appSettings.controller.js";

const router = express.Router();

router.use(cacheNoStore);

// Samo nalog "admin" for reads too - koji fičeri su uključeni je samo po
// sebi administrativna stvar, ista logika kao users.routes.js/activityLog.routes.js.
router.use(requireRootAdmin);

router.get("/", asyncHandler(listSettingsController));
router.patch("/", asyncHandler(updateSettingController));

export default router;
