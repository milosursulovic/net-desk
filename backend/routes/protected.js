import express from "express";
import ipAddressesRoutes from "./ipAddresses.js";
import metadataRoutes from "./metadata.js";

const router = express.Router();

router.use("/ip-addresses", ipAddressesRoutes);
router.use("/metadata", metadataRoutes);

export default router;
