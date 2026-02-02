import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/env.js";
import { findUserByUsername, updateUserPasswordHash } from "../repositories/users.repo.js";

export async function login(username, password) {
    const user = await findUserByUsername(username);
    if (!user) {
        const err = new Error("Neispravni kredencijali");
        err.status = 401;
        throw err;
    }

    let isMatch = false;

    if (typeof user.password === "string" && user.password.startsWith("$2")) {
        isMatch = await bcrypt.compare(password, user.password);
    } else {
        isMatch = password === user.password;
        if (isMatch) {
            const newHash = await bcrypt.hash(password, 10);
            await updateUserPasswordHash(user.id, newHash);
        }
    }

    if (!isMatch) {
        const err = new Error("Neispravni kredencijali");
        err.status = 401;
        throw err;
    }

    const role = user.username === "admin" ? "admin" : "user";

    const token = jwt.sign(
        { userId: user.id, username: user.username, role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256" }
    );

    return { token, expiresIn: JWT_EXPIRES_IN };
}

export function getMeFromToken(token) {
    try {
        const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
        return {
            userId: payload.userId,
            username: payload.username,
            role: payload.role || "user",
        };
    } catch {
        const err = new Error("Nevažeći ili istekao token");
        err.status = 401;
        throw err;
    }
}
