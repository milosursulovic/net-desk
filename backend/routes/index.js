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
// Namerno bez auth-a (izvan /api/protected) - ekran za prijavu treba jezik
// aplikacije PRE nego što uopšte postoji JWT, pa ovo mora biti javno čitljivo
// (samo čitanje trenutne vrednosti; izmena i dalje ide kroz
// /api/protected/settings, root-admin-only).
router.use("/api/language", languageRoutes);
router.use("/api/protected", authenticateToken, auditLog, protectedRoutes);

// Namerno bez auth-a (izvan /api/protected) - interni deployment binarni
// fajlovi (npr. UltraVNC zip-ovi za Deploy-NetdeskVnc.ps1), preuzimaju se sa
// upravljanih mašina preko HTTPS-a umesto SMB share-a jer LocalSystem nema
// pravu "logon session" za eksplicitne network kredencijale na Windows 7
// (System error 1312, otkriveno uživo) - obična HTTPS konekcija tu nema
// isto ograničenje, isti mehanizam agent već koristi za sve ostalo.
router.use("/uploads/downloads", express.static(path.join(process.cwd(), "uploads", "downloads")));

export default router;
