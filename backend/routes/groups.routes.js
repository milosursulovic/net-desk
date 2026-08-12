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

// GET otvoren svim ulogovanim (odeljenje/deployment grupa dropdown-ovi),
// POST nasleđuje writeRequiresOperator iz protected.routes.js - namerno bez
// dodatnog requireRole("admin"), dodavanje predefinisane grupe je
// niskorizična, lako povratna akcija (isti nivo kao npr. flagged domains).
// DELETE je admin-only - uklanjanje deljene, već-u-upotrebi reference je
// osetljivije od dodavanja (servis i dalje odbija brisanje grupe koja je u
// upotrebi, ovo je dodatni sloj, ne jedina zaštita).
router.get("/", asyncHandler(listGroupsController));
router.get("/usage", asyncHandler(listGroupsUsageController));
router.post("/", asyncHandler(createGroupController));
router.delete("/:name", requireRole("admin"), asyncHandler(deleteGroupController));

export default router;
