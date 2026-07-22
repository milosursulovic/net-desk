import webpush from "web-push";
import {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
} from "../config/env.js";
import {
  listPushSubscriptions,
  deletePushSubscriptionsByIds,
} from "../repositories/pushSubscriptions.repo.js";

const isConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);

if (isConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Sends `payload` to every subscribed device and prunes subscriptions the
// push service reports as gone (410 Gone / 404 Not Found - browser
// unsubscribed or uninstalled without ever calling our unsubscribe
// endpoint). Other errors are logged but the subscription is kept, since
// they may be transient (network blip on the push service's end).
export async function sendPushToAll(payload) {
  if (!isConfigured) return;

  const subscriptions = await listPushSubscriptions();
  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);
  const deadIds = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          deadIds.push(sub.id);
        } else {
          console.error(
            `❌ Push notifikacija nije uspela (id=${sub.id}):`,
            err?.message || err,
          );
        }
      }
    }),
  );

  if (deadIds.length) {
    await deletePushSubscriptionsByIds(deadIds);
  }
}
