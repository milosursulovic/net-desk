import express from "express";
import path from "path";
import authRoutes from "./auth.routes.js";
import protectedRoutes from "./protected.routes.js";
import agentsRoutes from "./agents.routes.js";
import managersRoutes from "./managers.routes.js";
import languageRoutes from "./language.routes.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { auditLog } from "../middlewares/auditLog.middleware.js";

const router = express.Router();

router.use("/api/auth", authRoutes);
router.use("/api/agents", agentsRoutes);
router.use("/api/managers", managersRoutes);
// Deliberately without auth (outside /api/protected) - the login screen needs the
// app language BEFORE a JWT even exists, so this must be publicly readable
// (only reading the current value; changing it still goes through
// /api/protected/settings, root-admin-only).
router.use("/api/language", languageRoutes);
router.use("/api/protected", authenticateToken, auditLog, protectedRoutes);

// Deliberately without auth (outside /api/protected) - internal deployment binary
// files (e.g. UltraVNC zips for Deploy-NetdeskVnc.ps1), downloaded from
// managed machines over HTTPS instead of an SMB share because LocalSystem has no
// real "logon session" for explicit network credentials on Windows 7
// (System error 1312, discovered live) - a plain HTTPS connection doesn't have
// the same limitation, the same mechanism the agent already uses for everything else.
router.use("/uploads/downloads", express.static(path.join(process.cwd(), "uploads", "downloads")));

export default router;
