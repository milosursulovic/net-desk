import express from "express";
import ipAddressesRoutes from "./ipAddresses.routes.js";
import metadataRoutes from "./metadata.routes.js";
import printersRoutes from "./printers.routes.js";
import inventoryRoutes from "./inventory.routes.js";

const router = express.Router();

router.use("/ip-addresses", ipAddressesRoutes);
router.use("/metadata", metadataRoutes);
router.use("/printers", printersRoutes);
router.use("/inventory", inventoryRoutes);

export default router;
