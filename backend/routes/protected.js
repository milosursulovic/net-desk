import express from "express";
import ipAddressesRoutes from "./ipAddresses.js";

const router = express.Router();

router.use("/ip-addresses", ipAddressesRoutes);

export default router;
