import { z } from "zod";

export const ROLES = ["admin", "operator", "viewer"];

export const CreateUserSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(8),
  role: z.enum(ROLES),
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(ROLES),
});
