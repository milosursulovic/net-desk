import { describe, it, expect, afterEach } from "vitest";
import {
  createService,
  updateService,
  deleteService,
  getByIdService,
  listService,
  filterOptionsService,
} from "../../services/ipAddresses.service.js";
import { deleteTestIpEntry, testIp } from "../helpers/testDb.js";

describe("ipAddresses.service (integration, real DB)", () => {
  let ipEntryId;
  let ipEntryId2;

  afterEach(async () => {
    await deleteTestIpEntry(ipEntryId);
    await deleteTestIpEntry(ipEntryId2);
    ipEntryId = undefined;
    ipEntryId2 = undefined;
  });

  it("createService inserts and returns the full row", async () => {
    const ip = testIp();
    const entry = await createService({
      ip,
      computerName: "TEST-PC",
      department: "VITEST_DEPT",
      os: "Windows 11",
      entryType: "computer",
    });
    ipEntryId = entry.id;

    expect(entry.ip).toBe(ip);
    expect(entry.computerName).toBe("TEST-PC");
    expect(entry.entryType).toBe("computer");
  });

  it("updateService only touches fields explicitly present in the patch", async () => {
    const entry = await createService({
      ip: testIp(),
      computerName: "ORIGINAL-NAME",
      department: "VITEST_DEPT",
    });
    ipEntryId = entry.id;

    await updateService(ipEntryId, { department: "VITEST_DEPT_2" });

    const reloaded = await getByIdService(ipEntryId);
    expect(reloaded.computerName).toBe("ORIGINAL-NAME");
    expect(reloaded.department).toBe("VITEST_DEPT_2");
  });

  it("deleteService removes the row; getByIdService then 404s", async () => {
    const entry = await createService({ ip: testIp() });
    const id = entry.id;

    await deleteService(id);
    await expect(getByIdService(id)).rejects.toMatchObject({ status: 404 });
  });

  it("deleteService on a missing id throws 404", async () => {
    await expect(deleteService(999999999)).rejects.toMatchObject({ status: 404 });
  });

  it("listService filters by department (exact match, distinct from free-text search)", async () => {
    const uniqueDept = `VITEST_DEPT_${Date.now()}`;
    const a = await createService({
      ip: testIp(),
      department: uniqueDept,
      entryType: "computer",
    });
    ipEntryId = a.id;
    const b = await createService({
      ip: testIp(),
      department: "some-other-department",
      entryType: "computer",
    });
    ipEntryId2 = b.id;

    const out = await listService({
      page: 1,
      limit: 50,
      sortBy: "ip",
      sortOrder: "asc",
      status: "all",
      entryType: "all",
      department: uniqueDept,
    });

    const ids = out.entries.map((e) => e.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
  });

  it("listService filters by os (exact match)", async () => {
    const uniqueOs = `VITEST_OS_${Date.now()}`;
    const a = await createService({ ip: testIp(), os: uniqueOs, entryType: "computer" });
    ipEntryId = a.id;

    const out = await listService({
      page: 1,
      limit: 50,
      sortBy: "ip",
      sortOrder: "asc",
      status: "all",
      entryType: "all",
      os: uniqueOs,
    });

    expect(out.entries.map((e) => e.id)).toContain(a.id);
    expect(out.total).toBe(1);
  });

  it("filterOptionsService includes a freshly-created distinct department/os value", async () => {
    const uniqueDept = `VITEST_DEPT_${Date.now()}`;
    const uniqueOs = `VITEST_OS_${Date.now()}`;
    const entry = await createService({ ip: testIp(), department: uniqueDept, os: uniqueOs });
    ipEntryId = entry.id;

    const out = await filterOptionsService();
    expect(out.departments).toContain(uniqueDept);
    expect(out.os).toContain(uniqueOs);
  });
});
