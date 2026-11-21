import { APP_SETTINGS } from "../dtos/appSettings.dto.js";
import {
  getSettingValue,
  listStoredSettings,
  upsertSetting,
} from "../repositories/appSettings.repo.js";
import { notFound } from "../utils/httpError.js";

// Shared helper for "the saved value, or the definition's default if it was
// never changed" - used by both isFeatureEnabled (boolean flags) and
// getAppLanguage (a select setting), without duplicating that logic.
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

// For other services to check whether some feature is currently
// enabled, without going through the RBAC/HTTP layer - a pure "is the
// flag on" question.
export async function isFeatureEnabled(key) {
  return (await getEffectiveSettingValue(key)) === "true";
}

// Publicly readable (no auth) via routes/language.routes.js - the login
// screen must know the language before a JWT even exists.
export async function getAppLanguage() {
  return (await getEffectiveSettingValue("app_language")) || "sr";
}
