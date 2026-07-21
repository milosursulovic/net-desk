import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
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
} from "../controllers/ipAddresses.controller.js";
import metadataForIpRoutes from "./ipAddressesMetadata.routes.js";

const router = express.Router();

router.get("/scan-ports", asyncHandler(scanPortsController));
router.get("/duplicates", asyncHandler(duplicatesController));
router.get("/export-xlsx", asyncHandler(exportXlsxController));
router.get("/filter-options", asyncHandler(filterOptionsController));

router.get("/", asyncHandler(listController));
router.get("/:id", asyncHandler(getByIdController));
router.get("/:id/uptime", asyncHandler(uptimeHistoryController));
router.post("/", asyncHandler(createController));
router.put("/:id", asyncHandler(updateController));
router.delete("/:id", asyncHandler(deleteController));

router.use("/", metadataForIpRoutes);

export default router;
