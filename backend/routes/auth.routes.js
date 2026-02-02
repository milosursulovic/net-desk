import express from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../utils/asyncHandler.js";
import { loginController, meController } from "../controllers/auth.controller.js";

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 50 });

router.post("/login", loginLimiter, asyncHandler(loginController));
router.get("/me", meController);

export default router;
