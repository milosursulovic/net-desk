import { inventoryAnalyticsStatsService } from "../services/pdsuAnalytics.service.js";

export async function inventoryAnalyticsStatsController(req, res) {
  const result = await inventoryAnalyticsStatsService();

  res.json(result);
}
