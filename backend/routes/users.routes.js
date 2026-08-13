import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRootAdmin } from "../middlewares/requireRole.middleware.js";
import {
  listUsersController,
  createUserController,
  updateUserRoleController,
  deleteUserController,
} from "../controllers/users.controller.js";

const router = express.Router();

// Samo nalog "admin" (ne bilo koji admin-role nalog) za sve, uključujući
// čitanje liste - ko ima koju ulogu je samo po sebi osetljivo, unlike most
// other /api/protected modules where GET is open to any authenticated role.
router.use(requireRootAdmin);

router.get("/", asyncHandler(listUsersController));
router.post("/", asyncHandler(createUserController));
router.patch("/:id/role", asyncHandler(updateUserRoleController));
router.delete("/:id", asyncHandler(deleteUserController));

export default router;
