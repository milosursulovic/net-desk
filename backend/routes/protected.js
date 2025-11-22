import express from "express";
import ipAddressesRoutes from "./ipAddresses.js";
import metadataRoutes from "./metadata.js";
import printersRoutes from "./printers.js";
import inventoryRoutes from "./inventory.js";

const router = express.Router();

router.use("/ip-addresses", ipAddressesRoutes);
router.use("/metadata", metadataRoutes);
router.use("/printers", printersRoutes);
router.use("/inventory", inventoryRoutes);

export default router;
