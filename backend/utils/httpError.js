export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export const badRequest = (message = "Neispravan zahtev.") =>
  new HttpError(400, message);

export const unauthorized = (message = "Neautorizovan pristup.") =>
  new HttpError(401, message);

export const forbidden = (message = "Zabranjen pristup.") =>
  new HttpError(403, message);

export const notFound = (message = "Nije pronađeno.") =>
  new HttpError(404, message);

export const conflict = (message = "Konflikt podataka.") =>
  new HttpError(409, message);
