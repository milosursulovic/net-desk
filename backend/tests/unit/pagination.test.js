import { describe, it, expect } from "vitest";
import { paginate } from "../../utils/pagination.js";

describe("paginate", () => {
  it("returns totalPages=0 and page=1 when there are no results", () => {
    expect(paginate({ page: 3, limit: 10, total: 0 })).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
    });
  });

  it("computes totalPages and clamps an out-of-range page down", () => {
    const out = paginate({ page: 99, limit: 10, total: 25 });
    expect(out.totalPages).toBe(3);
    expect(out.page).toBe(3);
  });

  it("clamps a page below 1 up to 1", () => {
    const out = paginate({ page: -5, limit: 10, total: 25 });
    expect(out.page).toBe(1);
  });

  it("leaves an in-range page untouched", () => {
    const out = paginate({ page: 2, limit: 10, total: 25 });
    expect(out.page).toBe(2);
  });

  it("coerces a non-numeric total to 0 instead of NaN", () => {
    const out = paginate({ page: 1, limit: 10, total: undefined });
    expect(out.total).toBe(0);
    expect(out.totalPages).toBe(0);
  });
});
