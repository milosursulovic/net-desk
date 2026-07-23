import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  listUsersController,
  createUserController,
  updateUserRoleController,
  deleteUserController,
} from "../controllers/users.controller.js";

const router = express.Router();

// Admin-only for everything, including reading the list - who has what role
// is itself sensitive, unlike most other /api/protected modules where GET
// is open to any authenticated role.
router.use(requireRole("admin"));

router.get("/", asyncHandler(listUsersController));
router.post("/", asyncHandler(createUserController));
router.patch("/:id/role", asyncHandler(updateUserRoleController));
router.delete("/:id", asyncHandler(deleteUserController));

export default router;
