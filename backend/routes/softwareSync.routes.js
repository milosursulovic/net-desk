import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createSoftwareSync } from "../controllers/softwareSync.controller.js";

const router = express.Router();

router.post("/", asyncHandler(createSoftwareSync));

export default router;
