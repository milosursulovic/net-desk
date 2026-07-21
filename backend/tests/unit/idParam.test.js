import { describe, it, expect } from "vitest";
import { parseIdParam } from "../../utils/idParam.js";
import { HttpError } from "../../utils/httpError.js";

describe("parseIdParam", () => {
  it("parses a valid numeric route param", () => {
    const req = { params: { id: "42" } };
    expect(parseIdParam(req)).toBe(42);
  });

  it("throws a 400 HttpError for a non-numeric param", () => {
    const req = { params: { id: "abc" } };
    expect(() => parseIdParam(req)).toThrow(HttpError);
    try {
      parseIdParam(req);
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  it("throws for a missing param (falsy id)", () => {
    const req = { params: {} };
    expect(() => parseIdParam(req)).toThrow(HttpError);
  });

  it("throws for id=0 (falsy, treated as invalid)", () => {
    const req = { params: { id: "0" } };
    expect(() => parseIdParam(req)).toThrow(HttpError);
  });

  it("supports a custom param name and label in the error message", () => {
    const req = { params: { jobId: "abc" } };
    expect(() => parseIdParam(req, "jobId", "ID zadatka")).toThrow(/ID zadatka/);
  });
});
