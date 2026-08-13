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

// Iznad same "admin" uloge - za module koje treba da vidi/koristi SAMO
// nalog sa korisničkim imenom "admin" (Korisnici/Logovi/Konfiguracija),
// ne bilo koji nalog sa ulogom "admin" - ta uloga može biti dodeljena više
// naloga (vidi users.routes.js), ovo je namerno uže od toga.
export const requireRootAdmin = (req, res, next) => {
  if (req.user?.role !== "admin" || req.user?.username !== "admin") {
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

// For modules that are otherwise fully admin-only (server health, DNS logs,
// process detections): operator is let in to read, but every write still
// needs admin - mirrors writeRequiresOperator's GET-vs-write split, just one
// tier stricter on both sides.
export const readRequiresOperator = (req, res, next) => {
  if (req.method === "GET") return requireRole("admin", "operator")(req, res, next);
  return requireRole("admin")(req, res, next);
};
