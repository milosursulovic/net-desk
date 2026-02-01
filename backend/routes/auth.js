import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../index.js";

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 50 });

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("❌ JWT_SECRET nije postavljen");
    return null;
  }
  return secret;
};

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Neispravan format podataka" });
    }
    const { username, password } = parsed.data;

    const secret = getJwtSecret();
    if (!secret) return res.status(500).json({ message: "Konfiguraciona greška" });

    const [rows] = await pool.execute(
      "SELECT id, username, password FROM users WHERE username = ? LIMIT 1",
      [username]
    );

    const user = rows?.[0];
    if (!user) {
      return res.status(401).json({ message: "Neispravni kredencijali" });
    }

    let isMatch = false;

    if (typeof user.password === "string" && user.password.startsWith("$2")) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = password === user.password;
      if (isMatch) {
        const newHash = await bcrypt.hash(password, 10);
        await pool.execute("UPDATE users SET password = ? WHERE id = ?", [newHash, user.id]);
      }
    }

    if (!isMatch) {
      return res.status(401).json({ message: "Neispravni kredencijali" });
    }

    const role = user.username === "admin" ? "admin" : "user";

    const token = jwt.sign(
      { userId: user.id, username: user.username, role },
      secret,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1h", algorithm: "HS256" }
    );

    return res.json({ token, expiresIn: process.env.JWT_EXPIRES_IN || "1h" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Greška na serveru" });
  }
});

router.get("/me", (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const [type, token] = auth.split(" ");
    if (type !== "Bearer" || !token) {
      return res.status(401).json({ message: "Nedostaje token" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("❌ JWT_SECRET nije postavljen");
      return res.status(500).json({ message: "Konfiguraciona greška" });
    }

    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });

    return res.json({
      userId: payload.userId,
      username: payload.username,
      role: payload.role || "user",
    });
  } catch (_e) {
    return res.status(401).json({ message: "Nevažeći ili istekao token" });
  }
});

export default router;

