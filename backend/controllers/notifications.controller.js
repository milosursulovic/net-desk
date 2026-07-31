import { listNotifications } from "../services/notifications.service.js";
import { SITES } from "../dtos/ipAddresses.dto.js";

function siteFilter(value) {
  return SITES.includes(value) ? value : undefined;
}

export async function listNotificationsController(req, res) {
  const result = await listNotifications(siteFilter(req.query.site));
  res.json(result);
}
