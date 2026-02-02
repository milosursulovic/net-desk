import express from "express";
import authRoutes from "./auth.routes.js";
import protectedRoutes from "./protected.routes.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use("/api/auth", authRoutes);
router.use("/api/protected", authenticateToken, protectedRoutes);

export default router;
