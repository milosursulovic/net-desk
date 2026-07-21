import net from "net";
import tls from "tls";
import { isPrivateIPv4 } from "../utils/ip.js";
import { ipToNumeric } from "../utils/ip.js";
import { emptyToNull } from "../utils/strings.js";
import { badRequest, notFound } from "../utils/httpError.js";
import {
  listIpEntries,
  findIpEntryById,
  insertIpEntry,
  updateIpEntryPatch,
  deleteIpEntry,
  duplicateComputerNameGroups,
  exportIpEntriesForXlsx,
  listDistinctDepartments,
  listDistinctOs,
} from "../repositories/ipEntries.repo.js";

const WELL_KNOWN_PORTS = {
  21: "FTP",
  22: "SSH",
  25: "SMTP",
  80: "HTTP",
  135: "RPC",
  139: "NetBIOS",
  443: "HTTPS",
  445: "SMB",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  5985: "WinRM (HTTP)",
  5986: "WinRM (HTTPS)",
  6379: "Redis",
  8080: "HTTP (alt)",
  8443: "HTTPS (alt)",
};

function parsePorts(str) {
  if (!str || String(str).trim() === "") {
    const full = [];
    for (let p = 1; p <= 65535; p++) full.push(p);
    return full;
  }
  const out = new Set();
  for (const seg of String(str)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (seg.includes("-")) {
      const parts = seg.split("-").map((x) => parseInt(x.trim(), 10));
      if (
        parts.length === 2 &&
        Number.isInteger(parts[0]) &&
        Number.isInteger(parts[1])
      ) {
        const a = Math.max(1, Math.min(65535, parts[0]));
        const b = Math.max(1, Math.min(65535, parts[1]));
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let p = lo; p <= hi; p++) out.add(p);
      }
    } else {
      const p = parseInt(seg, 10);
      if (Number.isInteger(p) && p >= 1 && p <= 65535) out.add(p);
    }
  }
  const arr = Array.from(out).sort((x, y) => x - y);
  if (arr.length) return arr;

  const full = [];
  for (let p = 1; p <= 65535; p++) full.push(p);
  return full;
}

async function probeTCP(ip, port, timeoutMs = 100) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;
    let banner = "";
    let proto = "tcp";

    const finish = (ok, extra = {}) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      resolve({
        ip,
        port,
        open: !!ok,
        rttMs: Date.now() - start,
        protocol: proto,
        serviceHint: WELL_KNOWN_PORTS[port] ?? null,
        banner: banner ? String(banner).slice(0, 800) : null,
        ...extra,
      });
    };

    socket.setTimeout(timeoutMs);

    socket.once("error", (err) =>
      finish(false, { error: err?.code || String(err) }),
    );
    socket.once("timeout", () => finish(false, { timeout: true }));

    socket.once("connect", () => {
      try {
        socket.setTimeout(600);
        socket.once("data", (buf) => {
          banner += buf.toString();
          finish(true);
        });

        // Protocol-detection heuristics, not an exhaustive service list -
        // common TLS/HTTP/Redis ports get a lightweight active probe
        // (TLS handshake, HTTP HEAD, Redis PING) to fill in a real banner;
        // any other port just waits for the server to speak first.
        if ([443, 8443, 9443, 6443].includes(port)) {
          proto = "tls";
          try {
            const tlsSock = tls.connect({
              socket,
              servername: ip,
              rejectUnauthorized: false,
            });
            tlsSock.setTimeout(1800);
            tlsSock.once("secureConnect", () => {
              const cert = tlsSock.getPeerCertificate?.() || {};
              banner = `TLS:${tlsSock.getProtocol() || "?"} · CN=${cert.subject?.CN || "?"}`;
              finish(true);
            });
            tlsSock.once("error", () => finish(true));
            tlsSock.once("timeout", () => finish(true));
            return;
          } catch {
            finish(true);
            return;
          }
        }

        if ([80, 8080, 8000, 8888].includes(port)) {
          socket.write(`HEAD / HTTP/1.0\r\nHost: ${ip}\r\n\r\n`);
          setTimeout(() => finish(true), 500);
          return;
        }

        if (port === 6379) {
          socket.write("*1\r\n$4\r\nPING\r\n");
          setTimeout(() => finish(true), 300);
          return;
        }

        setTimeout(() => finish(true), 500);
      } catch {
        finish(true);
      }
    });

    try {
      socket.connect(port, ip);
    } catch (e) {
      finish(false, { error: String(e) });
    }
  });
}

export async function scanPorts({ ip, ports, timeoutMs, concurrency }) {
  // Anti-SSRF guard: without this, an authenticated user could point the
  // server at an arbitrary public IP and use it as an open port scanner
  // against the internet, from the server's own network position.
  if (!isPrivateIPv4(ip)) {
    throw badRequest(
      "Skeniranje dozvoljeno samo za privatne IPv4 adrese (bez javnog skeniranja).",
    );
  }

  const portList = parsePorts(ports);
  const queue = [...portList];
  const results = [];
  let running = 0;

  await new Promise((resolve) => {
    const kick = () => {
      if (!queue.length && running === 0) return resolve();
      while (running < concurrency && queue.length) {
        const port = queue.shift();
        running++;
        probeTCP(ip, port, timeoutMs)
          .then((r) => results.push(r))
          .catch((err) =>
            results.push({ ip, port, open: false, error: String(err) }),
          )
          .finally(() => {
            running--;
            kick();
          });
      }
    };
    kick();
  });

  const open = results.filter((r) => r.open).sort((a, b) => a.port - b.port);
  return {
    ip,
    scanned: results.length,
    openCount: open.length,
    open,
    raw: results,
  };
}

export async function listService(filters) {
  return await listIpEntries(filters);
}

export async function filterOptionsService() {
  const [departments, os] = await Promise.all([
    listDistinctDepartments(),
    listDistinctOs(),
  ]);
  return { departments, os };
}

export async function getByIdService(id) {
  const entry = await findIpEntryById(id);
  if (!entry) {
    throw notFound("Unos nije pronađen");
  }
  return entry;
}

export async function createService(dto) {
  const ipNumeric = ipToNumeric(dto.ip);
  const id = await insertIpEntry({
    ip: dto.ip,
    ipNumeric,
    computerName: emptyToNull(dto.computerName),
    rdpApp: emptyToNull(dto.rdpApp),
    os: emptyToNull(dto.os),
    department: emptyToNull(dto.department),
    description: emptyToNull(dto.description),
    remoteScript: emptyToNull(dto.remoteScript),
    entryType: dto.entryType ?? null,
  });

  return await findIpEntryById(id);
}

export async function updateService(id, patch) {
  const sets = [];
  const params = [];

  if (patch.ip !== undefined) {
    const ipNumeric = ipToNumeric(patch.ip);
    sets.push("ip = ?");
    params.push(patch.ip);
    sets.push("ip_numeric = ?");
    params.push(ipNumeric);
  }
  if (patch.computerName !== undefined) {
    sets.push("computer_name = ?");
    params.push(emptyToNull(patch.computerName));
  }
  if (patch.rdpApp !== undefined) {
    sets.push("rdp_app = ?");
    params.push(emptyToNull(patch.rdpApp));
  }
  if (patch.os !== undefined) {
    sets.push("os = ?");
    params.push(emptyToNull(patch.os));
  }
  if (patch.department !== undefined) {
    sets.push("department = ?");
    params.push(emptyToNull(patch.department));
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    params.push(emptyToNull(patch.description));
  }
  if (patch.remoteScript !== undefined) {
    sets.push("remote_script = ?");
    params.push(emptyToNull(patch.remoteScript));
  }
  if (patch.entryType !== undefined) {
    sets.push("entry_type = ?");
    params.push(patch.entryType ?? null);
  }

  if (!sets.length) {
    throw badRequest("Nema polja za izmenu");
  }

  const affected = await updateIpEntryPatch(id, sets.join(", "), params);
  if (!affected) {
    throw notFound("Unos nije pronađen");
  }

  return await findIpEntryById(id);
}

export async function deleteService(id) {
  const affected = await deleteIpEntry(id);
  if (!affected) {
    throw notFound("Unos nije pronađen");
  }
  return true;
}

export async function duplicatesService({ search, status }) {
  return await duplicateComputerNameGroups({ search, status });
}

export async function exportXlsxRowsService(search) {
  const entries = await exportIpEntriesForXlsx(search);
  return entries.map((e) => ({
    ip: e.ip,
    computerName: e.computerName || "",
    rdpApp: e.rdpApp || "",
    os: e.os || "",
    department: e.department || "",
    entryType: labelForEntryType(e.entryType),
    remoteScript: e.remoteScript || "",
    hasMetadata: e.metadataId ? "Da" : "Ne",
    description: e.description || "",
  }));
}

function labelForEntryType(value) {
  if (value === "computer") return "Računar";
  if (value === "device") return "Aparat";
  return "Nepoznato";
}
