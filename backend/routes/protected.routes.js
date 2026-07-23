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
import usersRoutes from "./users.routes.js";
import activityLogRoutes from "./activityLog.routes.js";
import { writeRequiresOperator } from "../middlewares/requireRole.middleware.js";

const router = express.Router();

// Mounted before the blanket write policy below - both have their own
// per-route role checks that are looser than the default (push
// subscribe/unsubscribe and report mark-read are viewer-safe personal
// actions, not organizational data mutations), so they must not inherit it.
router.use("/push", pushSubscriptionsRoutes);
router.use("/reports", dailyReportsRoutes);

// Everything mounted after this point: GET open to any authenticated role,
// anything that changes state needs at least "operator" - "viewer" is
// read-only by default. Admin-only routes (users, agent-releases) layer
// requireRole("admin") on top of this themselves.
router.use(writeRequiresOperator);

router.use("/ip-addresses", ipAddressesRoutes);
router.use("/metadata", metadataRoutes);
router.use("/pdsu", pdsuRoutes);
router.use("/pdsu-analytics", pdsuAnalyticsRoutes);
router.use("/printers", printersRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/agents", agentsAdminRoutes);
router.use("/agent-releases", agentReleasesRoutes);
router.use("/users", usersRoutes);
router.use("/activity-log", activityLogRoutes);

export default router;
