import {
  SubscribePushSchema,
  UnsubscribePushSchema,
} from "../dtos/pushSubscriptions.dto.js";
import {
  subscribePushService,
  unsubscribePushService,
} from "../services/pushSubscriptions.service.js";
import { VAPID_PUBLIC_KEY } from "../config/env.js";
import { badRequest } from "../utils/httpError.js";

export async function subscribePushController(req, res) {
  const parsed = SubscribePushSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await subscribePushService(req.user?.userId ?? null, parsed.data);
  res.status(201).json(out);
}

export async function unsubscribePushController(req, res) {
  const parsed = UnsubscribePushSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await unsubscribePushService(parsed.data.endpoint);
  res.json(out);
}

export async function pushPublicKeyController(req, res) {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
}
