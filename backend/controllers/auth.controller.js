import { LoginSchema } from "../dtos/auth.dto.js";
import { login, getMeFromToken } from "../services/auth.service.js";

export async function loginController(req, res) {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Neispravan format podataka" });
    }

    const { username, password } = parsed.data;
    const out = await login(username, password);
    return res.json(out);
}

export function meController(req, res) {
    const auth = req.headers.authorization || "";
    const [type, token] = auth.split(" ");
    if (type !== "Bearer" || !token) {
        return res.status(401).json({ message: "Nedostaje token" });
    }

    const me = getMeFromToken(token);
    return res.json(me);
}
