import { toInt } from "./numbers.js";
import { badRequest } from "./httpError.js";

/**
 * Parses and validates a numeric route param (e.g. :id). Throws HttpError(400)
 * instead of a manual res.status(400).json(...) in every controller - errorHandler
 * (middlewares/error.middleware.js) formats the response.
 */
export function parseIdParam(req, paramName = "id", label = "ID") {
  const id = toInt(req.params[paramName]);
  if (!id) throw badRequest(`Neispravan ${label}.`);
  return id;
}
