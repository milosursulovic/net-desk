import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRole } from "../middlewares/requireRole.middleware.js";
import {
  scanPortsController,
  duplicatesController,
  exportXlsxController,
  filterOptionsController,
  listController,
  getByIdController,
  createController,
  updateController,
  deleteController,
  uptimeHistoryController,
  setPendingRepackController,
  wakeController,
  freeIpAddressesController,
} from "../controllers/ipAddresses.controller.js";
import metadataForIpRoutes from "./ipAddressesMetadata.routes.js";

const router = express.Router();

router.get("/scan-ports", asyncHandler(scanPortsController));
router.get("/duplicates", asyncHandler(duplicatesController));
router.get("/export-xlsx", asyncHandler(exportXlsxController));
router.get("/filter-options", asyncHandler(filterOptionsController));
// Mora biti registrovano PRE "/:id" ispod - isti razlog kao ostale rute
// iznad, "/:id" bi inače "free" protumačio kao id.
router.get("/free", asyncHandler(freeIpAddressesController));

router.get("/", asyncHandler(listController));
router.get("/:id", asyncHandler(getByIdController));
router.get("/:id/uptime", asyncHandler(uptimeHistoryController));
router.post("/:id/wake", asyncHandler(wakeController));
router.post("/", asyncHandler(createController));
router.put("/:id", asyncHandler(updateController));
router.patch("/:id/pending-repack", asyncHandler(setPendingRepackController));
router.delete("/:id", requireRole("admin"), asyncHandler(deleteController));

router.use("/", metadataForIpRoutes);

export default router;
