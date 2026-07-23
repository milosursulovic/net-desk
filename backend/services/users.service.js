import bcrypt from "bcryptjs";
import {
  listUsers,
  findUserById,
  findUserByUsername,
  createUser,
  updateUserRole,
  deleteUserById,
  countAdmins,
} from "../repositories/users.repo.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";

export async function listUsersService() {
  return await listUsers();
}

export async function createUserService({ username, password, role }) {
  const existing = await findUserByUsername(username);
  if (existing) {
    throw conflict("Korisničko ime je zauzeto");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const id = await createUser({ username, passwordHash, role });
  return await findUserById(id);
}

export async function updateUserRoleService(id, role) {
  const user = await findUserById(id);
  if (!user) {
    throw notFound("Korisnik nije pronađen");
  }

  // Can't demote the last admin - would leave nobody able to manage users/
  // roles at all, with no way back in short of a direct DB edit.
  if (user.role === "admin" && role !== "admin" && (await countAdmins()) <= 1) {
    throw badRequest("Ne može se ukloniti poslednji admin nalog");
  }

  await updateUserRole(id, role);
  return await findUserById(id);
}

export async function deleteUserService(id, actingUserId) {
  if (id === actingUserId) {
    throw badRequest("Ne možete obrisati sopstveni nalog");
  }

  const user = await findUserById(id);
  if (!user) {
    throw notFound("Korisnik nije pronađen");
  }

  if (user.role === "admin" && (await countAdmins()) <= 1) {
    throw badRequest("Ne može se obrisati poslednji admin nalog");
  }

  await deleteUserById(id);
}
