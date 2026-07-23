import { CreateUserSchema, UpdateUserRoleSchema } from "../dtos/users.dto.js";
import {
  listUsersService,
  createUserService,
  updateUserRoleService,
  deleteUserService,
} from "../services/users.service.js";
import { parseIdParam } from "../utils/idParam.js";
import { badRequest } from "../utils/httpError.js";

export async function listUsersController(req, res) {
  const out = await listUsersService();
  res.json(out);
}

export async function createUserController(req, res) {
  const parsed = CreateUserSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await createUserService(parsed.data);
  res.status(201).json(out);
}

export async function updateUserRoleController(req, res) {
  const id = parseIdParam(req, "id", "ID korisnika");

  const parsed = UpdateUserRoleSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await updateUserRoleService(id, parsed.data.role);
  res.json(out);
}

export async function deleteUserController(req, res) {
  const id = parseIdParam(req, "id", "ID korisnika");
  await deleteUserService(id, req.user.userId);
  res.status(204).send();
}
