import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import { getAppLanguage } from "../services/appSettings.service.js";

const router = express.Router();

router.use(cacheNoStore);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ language: await getAppLanguage() });
  }),
);

export default router;
