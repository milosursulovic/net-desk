import express from "express";
import ipAddressesRoutes from "./ipAddresses.routes.js";
import metadataRoutes from "./metadata.routes.js";
import pdsuRoutes from "./pdsu.routes.js";
import pdsuAnalyticsRoutes from "./pdsuAnalytics.routes.js";
import printersRoutes from "./printers.routes.js";
import inventoryRoutes from "./inventory.routes.js";
import notificationsRoutes from "./notifications.routes.js";
import agentsAdminRoutes from "./agentsAdmin.routes.js";
import agentReleasesRoutes from "./agentReleases.routes.js";
import pushSubscriptionsRoutes from "./pushSubscriptions.routes.js";
import dailyReportsRoutes from "./dailyReports.routes.js";

const router = express.Router();

router.use("/ip-addresses", ipAddressesRoutes);
router.use("/metadata", metadataRoutes);
router.use("/pdsu", pdsuRoutes);
router.use("/pdsu-analytics", pdsuAnalyticsRoutes);
router.use("/printers", printersRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/agents", agentsAdminRoutes);
router.use("/agent-releases", agentReleasesRoutes);
router.use("/push", pushSubscriptionsRoutes);
router.use("/reports", dailyReportsRoutes);

export default router;
