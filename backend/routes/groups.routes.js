import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { listGroupsController, createGroupController } from "../controllers/groups.controller.js";

const router = express.Router();

// GET otvoren svim ulogovanim (odeljenje/deployment grupa dropdown-ovi),
// POST nasleđuje writeRequiresOperator iz protected.routes.js - namerno bez
// dodatnog requireRole("admin"), dodavanje predefinisane grupe je
// niskorizična, lako povratna akcija (isti nivo kao npr. flagged domains).
router.get("/", asyncHandler(listGroupsController));
router.post("/", asyncHandler(createGroupController));

export default router;
