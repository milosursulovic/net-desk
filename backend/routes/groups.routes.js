import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  listGroupsController,
  listGroupsUsageController,
  createGroupController,
  deleteGroupController,
} from "../controllers/groups.controller.js";

const router = express.Router();

// GET open to all signed-in users (department/deployment group dropdowns),
// POST inherits writeRequiresOperator from protected.routes.js - deliberately without
// an extra requireRole("admin"), adding a predefined group is a
// low-risk, easily reversible action (same level as e.g. flagged domains).
// DELETE is admin-only - removing a shared, already-in-use reference is
// more sensitive than adding one (the service still refuses to delete a group that's in
// use, this is an extra layer, not the only protection).
router.get("/", asyncHandler(listGroupsController));
router.get("/usage", asyncHandler(listGroupsUsageController));
router.post("/", asyncHandler(createGroupController));
router.delete("/:name", requireRole("admin"), asyncHandler(deleteGroupController));

export default router;
