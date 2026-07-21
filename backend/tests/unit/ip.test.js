import { describe, it, expect } from "vitest";
import { isValidIPv4, ipToNumeric, isPrivateIPv4 } from "../../utils/ip.js";

describe("isValidIPv4", () => {
  it("accepts valid addresses", () => {
    expect(isValidIPv4("10.230.62.81")).toBe(true);
    expect(isValidIPv4("0.0.0.0")).toBe(true);
    expect(isValidIPv4("255.255.255.255")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidIPv4("10.230.62")).toBe(false);
    expect(isValidIPv4("10.230.62.81.1")).toBe(false);
    expect(isValidIPv4("10.230.62.256")).toBe(false);
    expect(isValidIPv4("not.an.ip.addr")).toBe(false);
    expect(isValidIPv4("")).toBe(false);
    expect(isValidIPv4(null)).toBe(false);
    expect(isValidIPv4(undefined)).toBe(false);
    expect(isValidIPv4(12345)).toBe(false);
  });
});

describe("ipToNumeric", () => {
  it("converts an IPv4 address to its numeric form", () => {
    expect(ipToNumeric("0.0.0.1")).toBe(1);
    expect(ipToNumeric("0.0.1.0")).toBe(256);
    expect(ipToNumeric("255.255.255.255")).toBe(4294967295);
  });

  it("is monotonic for ascending addresses (used for ORDER BY ip_numeric)", () => {
    expect(ipToNumeric("10.230.62.4")).toBeLessThan(ipToNumeric("10.230.62.5"));
    expect(ipToNumeric("10.230.62.255")).toBeLessThan(ipToNumeric("10.230.63.0"));
  });

  it("throws on an invalid address rather than returning garbage", () => {
    expect(() => ipToNumeric("not an ip")).toThrow();
  });
});

describe("isPrivateIPv4", () => {
  it("recognizes RFC1918 private ranges", () => {
    expect(isPrivateIPv4("10.230.62.81")).toBe(true);
    expect(isPrivateIPv4("192.168.1.1")).toBe(true);
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
  });

  it("rejects public addresses and the adjacent 172.x range", () => {
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
    expect(isPrivateIPv4("172.15.0.1")).toBe(false);
  });
});
