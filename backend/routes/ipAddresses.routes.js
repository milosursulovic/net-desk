import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    scanPortsController,
    duplicatesController,
    exportXlsxController,
    listController,
    getByIdController,
    createController,
    updateController,
    deleteController,
} from "../controllers/ipAddresses.controller.js";
import metadataForIpRoutes from "./ipAddressesMetadata.routes.js";

const router = express.Router();

router.get("/scan-ports", asyncHandler(scanPortsController));
router.get("/duplicates", asyncHandler(duplicatesController));
router.get("/export-xlsx", asyncHandler(exportXlsxController));

router.get("/", asyncHandler(listController));
router.get("/:id", asyncHandler(getByIdController));
router.post("/", asyncHandler(createController));
router.put("/:id", asyncHandler(updateController));
router.delete("/:id", asyncHandler(deleteController));

router.use("/", metadataForIpRoutes);

export default router;
