import {
  upsertPushSubscription,
  deletePushSubscriptionByEndpoint,
} from "../repositories/pushSubscriptions.repo.js";

export async function subscribePushService(userId, { endpoint, keys }) {
  await upsertPushSubscription({
    userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
  return { ok: true };
}

export async function unsubscribePushService(endpoint) {
  await deletePushSubscriptionByEndpoint(endpoint);
  return { ok: true };
}
