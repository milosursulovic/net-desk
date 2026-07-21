import { describe, it, expect } from "vitest";
import { buildLikeSearch } from "../../utils/sqlSearch.js";

describe("buildLikeSearch", () => {
  it("returns an empty clause for a blank term", () => {
    expect(buildLikeSearch(["ip", "computer_name"], "")).toEqual({
      where: "",
      params: [],
    });
    expect(buildLikeSearch(["ip"], "   ")).toEqual({ where: "", params: [] });
  });

  it("returns an empty clause when no columns are given", () => {
    expect(buildLikeSearch([], "term")).toEqual({ where: "", params: [] });
  });

  it("builds an OR'd LIKE clause across columns with contains-matching by default", () => {
    const out = buildLikeSearch(["ip", "computer_name"], "abc");
    expect(out.where).toBe("(ip LIKE ? OR computer_name LIKE ?)");
    expect(out.params).toEqual(["%abc%", "%abc%"]);
  });

  it("uses prefix matching only for columns listed in prefixColumns", () => {
    const out = buildLikeSearch(["ip", "computer_name"], "10.230", {
      prefixColumns: ["ip"],
    });
    expect(out.params).toEqual(["10.230%", "%10.230%"]);
  });

  it("trims the search term", () => {
    const out = buildLikeSearch(["ip"], "  10.230  ");
    expect(out.params).toEqual(["%10.230%"]);
  });
});
