import { APP_SETTINGS } from "../dtos/appSettings.dto.js";
import {
  getSettingValue,
  listStoredSettings,
  upsertSetting,
} from "../repositories/appSettings.repo.js";
import { notFound } from "../utils/httpError.js";

export async function listSettingsService() {
  const stored = await listStoredSettings();
  const storedMap = new Map(stored.map((s) => [s.key, s]));

  return APP_SETTINGS.map((def) => {
    const row = storedMap.get(def.key);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      type: def.type,
      value: (row ? row.value : def.default) === "true",
      updatedAt: row ? row.updatedAt : null,
    };
  });
}

export async function updateSettingService(key, value, updatedByUserId) {
  const def = APP_SETTINGS.find((s) => s.key === key);
  if (!def) {
    throw notFound("Nepoznato podešavanje");
  }

  await upsertSetting(key, value ? "true" : "false", updatedByUserId);
  return await listSettingsService();
}

// Za druge servise da provere da li je neka funkcionalnost trenutno
// omogućena (npr. vncSessions.service.js pre kreiranja sesije) - ne
// prolazi kroz RBAC/HTTP sloj, čisto pitanje "da li je flag uključen".
export async function isFeatureEnabled(key) {
  const def = APP_SETTINGS.find((s) => s.key === key);
  const stored = await getSettingValue(key);
  const effective = stored ?? def?.default ?? "false";
  return effective === "true";
}
