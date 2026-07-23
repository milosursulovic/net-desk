import { describe, it, expect, vi } from "vitest";
import { requireRole, writeRequiresOperator } from "../../middlewares/requireRole.middleware.js";

function mockReq({ role, method = "GET" } = {}) {
  return { user: role ? { role } : undefined, method };
}

describe("requireRole", () => {
  it("calls next() with no args when the user's role is in the allowlist", () => {
    const next = vi.fn();
    requireRole("admin", "operator")(mockReq({ role: "operator" }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("calls next(err) with a 403 HttpError when the role isn't allowed", () => {
    const next = vi.fn();
    requireRole("admin")(mockReq({ role: "viewer" }), {}, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeTruthy();
    expect(err.status).toBe(403);
  });

  it("rejects when req.user is missing entirely (no role to check)", () => {
    const next = vi.fn();
    requireRole("admin")(mockReq({ role: undefined }), {}, next);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
  });
});

describe("writeRequiresOperator", () => {
  it("allows GET regardless of role", () => {
    const next = vi.fn();
    writeRequiresOperator(mockReq({ role: "viewer", method: "GET" }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("allows POST/PUT/PATCH/DELETE for operator and admin", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const role of ["operator", "admin"]) {
        const next = vi.fn();
        writeRequiresOperator(mockReq({ role, method }), {}, next);
        expect(next).toHaveBeenCalledWith();
      }
    }
  });

  it("rejects non-GET methods for viewer", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const next = vi.fn();
      writeRequiresOperator(mockReq({ role: "viewer", method }), {}, next);
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(403);
    }
  });
});
