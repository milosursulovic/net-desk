import { UpdateSettingSchema } from "../dtos/appSettings.dto.js";
import {
  listSettingsService,
  updateSettingService,
} from "../services/appSettings.service.js";
import { badRequest } from "../utils/httpError.js";

export async function listSettingsController(req, res) {
  const out = await listSettingsService();
  res.json(out);
}

export async function updateSettingController(req, res) {
  const parsed = UpdateSettingSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await updateSettingService(parsed.data.key, parsed.data.value, req.user?.userId ?? null);
  res.json(out);
}
