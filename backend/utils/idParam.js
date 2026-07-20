import { toInt } from "./numbers.js";
import { badRequest } from "./httpError.js";

/**
 * Parsira i validira numerički route param (npr. :id). Baca HttpError(400)
 * umesto ručnog res.status(400).json(...) u svakom kontroleru - errorHandler
 * (middlewares/error.middleware.js) formatira odgovor.
 */
export function parseIdParam(req, paramName = "id", label = "ID") {
  const id = toInt(req.params[paramName]);
  if (!id) throw badRequest(`Neispravan ${label}.`);
  return id;
}
