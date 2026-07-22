import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  subscribePushController,
  unsubscribePushController,
  pushPublicKeyController,
} from "../controllers/pushSubscriptions.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/public-key", asyncHandler(pushPublicKeyController));
router.post("/subscribe", asyncHandler(subscribePushController));
router.post("/unsubscribe", asyncHandler(unsubscribePushController));

export default router;
