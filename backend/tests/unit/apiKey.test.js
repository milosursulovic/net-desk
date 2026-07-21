import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey } from "../../utils/apiKey.js";

describe("generateApiKey", () => {
  it("generates a 64-char hex string", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique keys across calls", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).not.toBe(b);
  });
});

describe("hashApiKey", () => {
  it("is deterministic for the same input", () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it("produces a 64-char hex SHA-256 digest", () => {
    expect(hashApiKey("test-key")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different keys", () => {
    expect(hashApiKey("key-a")).not.toBe(hashApiKey("key-b"));
  });
});
