import { listNotifications } from "../services/notifications.service.js";

export async function listNotificationsController(req, res) {
  const result = await listNotifications();
  res.json(result);
}
