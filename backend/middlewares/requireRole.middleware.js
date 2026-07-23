import { forbidden } from "../utils/httpError.js";

// req.user is the decoded JWT payload (authenticateToken already ran) -
// { userId, username, role }.
export const requireRole =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!allowedRoles.includes(req.user?.role)) {
      return next(forbidden("Nemate dozvolu za ovu akciju"));
    }
    next();
  };

// Default policy for most of /api/protected: reading (GET) is open to any
// authenticated role, everything that changes state needs at least
// "operator" - "viewer" is read-only everywhere unless a route explicitly
// says otherwise. Stricter routes (admin-only) layer requireRole("admin")
// on top of this; looser routes (viewer-safe writes like push subscribe or
// report mark-read) are mounted before this runs, in protected.routes.js.
export const writeRequiresOperator = (req, res, next) => {
  if (req.method === "GET") return next();
  return requireRole("admin", "operator")(req, res, next);
};
