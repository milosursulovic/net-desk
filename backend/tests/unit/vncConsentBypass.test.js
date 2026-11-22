import { describe, it, expect } from "vitest";
import { shouldBypassConsent } from "../../services/vncSessions.service.js";

describe("shouldBypassConsent (vnc_consent_bypass_legacy rollout setting)", () => {
  it("bypasses agents older than 1.7.0 while the setting is on", () => {
    expect(shouldBypassConsent("1.6.9", true)).toBe(true);
    expect(shouldBypassConsent("1.5.7", true)).toBe(true);
  });

  it("treats an unknown agent version as old (it can't ask for consent either)", () => {
    expect(shouldBypassConsent(null, true)).toBe(true);
  });

  it("never bypasses agents that can ask for consent", () => {
    expect(shouldBypassConsent("1.7.0", true)).toBe(false);
    expect(shouldBypassConsent("1.10.0", true)).toBe(false);
  });

  it("never bypasses anyone while the setting is off", () => {
    expect(shouldBypassConsent("1.6.0", false)).toBe(false);
    expect(shouldBypassConsent(null, false)).toBe(false);
  });
});
