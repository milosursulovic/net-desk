import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  listDeploymentGroupsController,
  listDeploymentGroupsUsageController,
  createDeploymentGroupController,
  deleteDeploymentGroupController,
} from "../controllers/deploymentGroups.controller.js";

const router = express.Router();

// Same pattern as groups.routes.js - GET open to all signed-in users, POST
// inherits writeRequiresOperator (adding a predefined value is
// low-risk), DELETE is admin-only.
router.get("/", asyncHandler(listDeploymentGroupsController));
router.get("/usage", asyncHandler(listDeploymentGroupsUsageController));
router.post("/", asyncHandler(createDeploymentGroupController));
router.delete("/:name", requireRole("admin"), asyncHandler(deleteDeploymentGroupController));

export default router;
