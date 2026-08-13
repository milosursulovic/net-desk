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

// Isti obrazac kao groups.routes.js - GET otvoren svim ulogovanim, POST
// nasleđuje writeRequiresOperator (dodavanje predefinisane vrednosti je
// niskorizično), DELETE je admin-only.
router.get("/", asyncHandler(listDeploymentGroupsController));
router.get("/usage", asyncHandler(listDeploymentGroupsUsageController));
router.post("/", asyncHandler(createDeploymentGroupController));
router.delete("/:name", requireRole("admin"), asyncHandler(deleteDeploymentGroupController));

export default router;
