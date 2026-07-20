import { LoginSchema } from "../dtos/auth.dto.js";
import { login, getMeFromToken } from "../services/auth.service.js";
import { badRequest, unauthorized } from "../utils/httpError.js";

export async function loginController(req, res) {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Neispravan format podataka");
  }

  const { username, password } = parsed.data;
  const out = await login(username, password);
  return res.json(out);
}

export function meController(req, res) {
  const auth = req.headers.authorization || "";
  const [type, token] = auth.split(" ");
  if (type !== "Bearer" || !token) {
    throw unauthorized("Nedostaje token");
  }

  const me = getMeFromToken(token);
  return res.json(me);
}
