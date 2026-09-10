import { APP_SETTINGS } from "../dtos/appSettings.dto.js";
import {
  getSettingValue,
  listStoredSettings,
  upsertSetting,
} from "../repositories/appSettings.repo.js";
import { notFound } from "../utils/httpError.js";

// Zajednički helper za "sačuvana vrednost, ili default definicije ako
// nikad nije menjana" - koriste ga i isFeatureEnabled (boolean flags) i
// getAppLanguage (select podešavanje), bez dupliranja te logike.
export async function getEffectiveSettingValue(key) {
  const def = APP_SETTINGS.find((s) => s.key === key);
  const stored = await getSettingValue(key);
  return stored ?? def?.default ?? null;
}

function rawValueToTyped(def, rawValue) {
  return def.type === "boolean" ? rawValue === "true" : rawValue;
}

export async function listSettingsService() {
  const stored = await listStoredSettings();
  const storedMap = new Map(stored.map((s) => [s.key, s]));

  return APP_SETTINGS.map((def) => {
    const row = storedMap.get(def.key);
    const rawValue = row ? row.value : def.default;
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      type: def.type,
      options: def.options,
      value: rawValueToTyped(def, rawValue),
      updatedAt: row ? row.updatedAt : null,
    };
  });
}

export async function updateSettingService(key, value, updatedByUserId) {
  const def = APP_SETTINGS.find((s) => s.key === key);
  if (!def) {
    throw notFound("Nepoznato podešavanje");
  }

  const rawValue = def.type === "boolean" ? (value ? "true" : "false") : value;
  await upsertSetting(key, rawValue, updatedByUserId);
  return await listSettingsService();
}

// Za druge servise da provere da li je neka funkcionalnost trenutno
// omogućena, bez prolaska kroz RBAC/HTTP sloj - čisto pitanje "da li je
// flag uključen".
export async function isFeatureEnabled(key) {
  return (await getEffectiveSettingValue(key)) === "true";
}

// Javno čitljivo (bez auth-a) preko routes/language.routes.js - ekran za
// prijavu mora da zna jezik pre nego što uopšte postoji JWT.
export async function getAppLanguage() {
  return (await getEffectiveSettingValue("app_language")) || "sr";
}
