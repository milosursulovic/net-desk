import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { listNotificationsController } from "../controllers/notifications.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/", asyncHandler(listNotificationsController));

export default router;
