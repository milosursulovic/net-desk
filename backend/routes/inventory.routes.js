import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cacheNoStore } from "../middlewares/cacheNoStore.middleware.js";
import {
  exportInventoryController,
  getInventoryItemController,
  listInventoryController,
  createInventoryItemController,
  updateInventoryItemController,
  deleteInventoryItemController,
} from "../controllers/inventory.controller.js";

const router = express.Router();

router.use(cacheNoStore);

router.get("/export", asyncHandler(exportInventoryController));
router.get("/", asyncHandler(listInventoryController));
router.get("/:id", asyncHandler(getInventoryItemController));
router.post("/", asyncHandler(createInventoryItemController));
router.put("/:id", asyncHandler(updateInventoryItemController));
router.delete("/:id", asyncHandler(deleteInventoryItemController));

export default router;
