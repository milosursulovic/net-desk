import express from "express";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 50 });

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Neispravan format podataka" });
    }
    const { username, password } = parsed.data;

    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET nije postavljen");
      return res.status(500).json({ message: "Konfiguraciona greška" });
    }

    const user = await User.findOne({ username }).select("+password");
    if (!user)
      return res.status(401).json({ message: "Neispravni kredencijali" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Neispravni kredencijali" });

    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role || "user" },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1h", algorithm: "HS256" }
    );

    return res.json({ token, expiresIn: process.env.JWT_EXPIRES_IN || "1h" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Greška na serveru" });
  }
});

export default router;
