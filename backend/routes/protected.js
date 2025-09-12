import express from "express";
import ipAddressesRoutes from "./ipAddresses.js";
import metadataRoutes from "./metadata.js";
import printersRoutes from "./printers.js";

const router = express.Router();

router.use("/ip-addresses", ipAddressesRoutes);
router.use("/metadata", metadataRoutes);
router.use("/printers", printersRoutes);

export default router;
