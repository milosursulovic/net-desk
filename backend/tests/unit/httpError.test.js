import { describe, it, expect } from "vitest";
import {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
} from "../../utils/httpError.js";

describe("httpError factories", () => {
  it("attach the right status code to each error type", () => {
    expect(badRequest()).toBeInstanceOf(HttpError);
    expect(badRequest().status).toBe(400);
    expect(unauthorized().status).toBe(401);
    expect(forbidden().status).toBe(403);
    expect(notFound().status).toBe(404);
    expect(conflict().status).toBe(409);
  });

  it("use the provided message, or a sensible default", () => {
    expect(notFound("Agent nije pronađen").message).toBe("Agent nije pronađen");
    expect(notFound().message).toBeTruthy();
  });

  it("are real Error instances (so they work with try/catch and stack traces)", () => {
    const err = badRequest("x");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("HttpError");
  });
});
