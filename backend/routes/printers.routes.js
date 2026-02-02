import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    exportXlsxPrintersController,
    listPrintersController,
    getPrinterController,
    createPrinterController,
    updatePrinterController,
    deletePrinterController,
    setHostController,
    unsetHostController,
    connectController,
    disconnectController,
} from "../controllers/printers.controller.js";

const router = express.Router();

router.get("/export-xlsx", asyncHandler(exportXlsxPrintersController));

router.get("/", asyncHandler(listPrintersController));
router.get("/:id", asyncHandler(getPrinterController));
router.post("/", asyncHandler(createPrinterController));
router.put("/:id", asyncHandler(updatePrinterController));
router.delete("/:id", asyncHandler(deletePrinterController));

router.post("/:id/set-host", asyncHandler(setHostController));
router.post("/:id/unset-host", asyncHandler(unsetHostController));
router.post("/:id/connect", asyncHandler(connectController));
router.post("/:id/disconnect", asyncHandler(disconnectController));

export default router;
