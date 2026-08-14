import net from "net";
import tls from "tls";
import { isPrivateIPv4 } from "../utils/ip.js";
import { ipToNumeric, numericToIp } from "../utils/ip.js";
import { emptyToNull } from "../utils/strings.js";
import { badRequest, notFound } from "../utils/httpError.js";
import {
  listIpEntries,
  findIpEntryById,
  insertIpEntry,
  updateIpEntryPatch,
  updatePendingRepack,
  deleteIpEntry,
  duplicateComputerNameGroups,
  exportIpEntriesForXlsx,
  listDistinctDepartments,
  listDistinctOs,
  listDistinctOsArchitectures,
  listIpNumericsInRange,
  listRepackCandidates,
} from "../repositories/ipEntries.repo.js";
import { RDP_APP_PATTERNS } from "../dtos/ipAddresses.dto.js";
import { findMacsForIpEntry } from "../repositories/metadata.repo.js";
import { classifyCpuTier } from "../utils/cpuTier.js";
import { sendMagicPacket } from "../utils/wakeOnLan.js";

// Mrežna i broadcast adresa lokalnog segmenta svake lokacije - i za WOL
// (magic paket ide direktno na broadcast ciljne mreže, ne rutira se) i za
// "slobodne IP adrese" ispod (opseg = mrežna+1 do broadcast-1, te dve
// adrese same nisu upotrebljive za hostove).
const SITE_NETWORK_ADDRESS = {
  bolnica: "10.230.62.0", // 10.230.62.0/23
  dom_zdravlja: "10.160.64.0", // 10.160.64.0/21
};
const SITE_BROADCAST_ADDRESS = {
  bolnica: "10.230.63.255",
  dom_zdravlja: "10.160.71.255",
};

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

export async function setPendingRepackService(id, value) {
  const affected = await updatePendingRepack(id, value);
  if (!affected) {
    throw notFound("Unos nije pronađen");
  }
  return await findIpEntryById(id);
}

// WMI Win32_ComputerSystem.TotalPhysicalMemory je USABLE RAM, uvek nešto
// ispod nominalne veličine (BIOS/firmware rezervacija) - uživo izmereno na
// ovoj floti, "pravih" 8GB mašina se prijavljuje kao 7.4-7.9, "pravih" 4GB
// kao 3.4-3.9, sa čistim razmakom između te dve grupe (ništa između 4 i
// 7.4). Prag od 7 GB namerno pada u taj razmak - hvata sve "manje od 8GB"
// mašine (4GB i niže) bez lažnog pogotka na mašine koje STVARNO imaju 8GB
// (koje bi doslovno "< 8" pogrešno uhvatio zbog rezervacije).
const LOW_RAM_THRESHOLD_GB = 7;

// "Preporuka za pakovanje" - računari na Windows 10/11 čiji hardver (slab
// CPU po cpuTier.js, malo RAM-a, i/ili običan HDD umesto SSD-a) ukazuje da
// su kandidati za reimage/upgrade. Namerno se NE čuva u bazi (za razliku od
// ručnog pending_repack flag-a) - računa se uživo na svaki zahtev, da
// ostane tačno i posle nadogradnje hardvera/OS-a bez posebnog koraka za
// "osvežavanje preporuke".
export async function repackRecommendationsService(site) {
  const candidates = await listRepackCandidates(site);

  return candidates
    .map((c) => {
      const cpuTier = classifyCpuTier(c.cpuName);
      const ramGb = c.ramGb == null ? null : Number(c.ramGb);
      const hasHdd = Boolean(c.hasHdd);
      const reasons = [];
      if (cpuTier === "weak") reasons.push("weak_cpu");
      if (ramGb != null && ramGb < LOW_RAM_THRESHOLD_GB) reasons.push("low_ram");
      if (hasHdd) reasons.push("has_hdd");
      return { ...c, cpuTier, ramGb, hasHdd, reasons };
    })
    .filter((c) => c.reasons.length > 0);
}

export async function filterOptionsService(site) {
  const [departments, os, osArchitectures] = await Promise.all([
    listDistinctDepartments(site),
    listDistinctOs(site),
    listDistinctOsArchitectures(site),
  ]);
  // rdpApps je fiksna poznata lista (RDP_APP_PATTERNS), ne "distinct" upit -
  // ip_entries.rdp_app čuva SPOJENE kombinacije (npr. "AnyDesk, TeamViewer"),
  // pa bi distinct nad tom kolonom vratio kombinacije, ne pojedinačne alate.
  const rdpApps = RDP_APP_PATTERNS.map((p) => p.label);
  return { departments, os, osArchitectures, rdpApps };
}

// Opseg = mrežna adresa + 1 do broadcast adresa - 1 (te dve granične adrese
// same nisu upotrebljive za hostove). Malo dovoljno (bolnica /23 = 510
// upotrebljivih, dom_zdravlja /21 = 2046) da se generiše i vrati ceo
// spisak slobodnih odjednom - bez potrebe za server-side paginacijom kao
// kod flagged_domains (koja ima ~88k redova, sasvim druga razmera).
export async function freeIpAddressesService(site) {
  const networkAddress = SITE_NETWORK_ADDRESS[site];
  const broadcastAddress = SITE_BROADCAST_ADDRESS[site];
  if (!networkAddress || !broadcastAddress) {
    throw badRequest("Nepoznata lokacija");
  }

  const startNumeric = ipToNumeric(networkAddress) + 1;
  const endNumeric = ipToNumeric(broadcastAddress) - 1;

  const occupied = new Set(await listIpNumericsInRange(startNumeric, endNumeric));

  const freeIps = [];
  for (let n = startNumeric; n <= endNumeric; n++) {
    if (!occupied.has(n)) freeIps.push(numericToIp(n));
  }

  return {
    site,
    total: endNumeric - startNumeric + 1,
    occupiedCount: occupied.size,
    freeIps,
  };
}

export async function getByIdService(id) {
  const entry = await findIpEntryById(id);
  if (!entry) {
    throw notFound("Unos nije pronađen");
  }
  return entry;
}

export async function wakeService(id) {
  const entry = await findIpEntryById(id);
  if (!entry) {
    throw notFound("Unos nije pronađen");
  }

  const broadcastAddress = SITE_BROADCAST_ADDRESS[entry.site];
  if (!broadcastAddress) {
    throw badRequest("Nepoznata lokacija - ne mogu da odredim broadcast adresu za buđenje.");
  }

  const macs = await findMacsForIpEntry(id);
  if (macs.length === 0) {
    throw badRequest("Nema poznate MAC adrese za ovaj računar (potreban je inventar sa mrežnim karticama).");
  }

  await Promise.all(macs.map((mac) => sendMagicPacket(mac, broadcastAddress)));

  return { macs, broadcastAddress };
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
    site: dto.site,
    description: emptyToNull(dto.description),
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
  if (patch.site !== undefined) {
    sets.push("site = ?");
    params.push(patch.site);
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    params.push(emptyToNull(patch.description));
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

export async function duplicatesService({ search, status, site }) {
  return await duplicateComputerNameGroups({ search, status, site });
}

export async function exportXlsxRowsService(search, site) {
  const entries = await exportIpEntriesForXlsx(search, site);
  return entries.map((e) => ({
    ip: e.ip,
    computerName: e.computerName || "",
    rdpApp: e.rdpApp || "",
    os: e.os || "",
    osArchitecture: e.osArchitecture || "",
    hasIzvolteFolder: e.hasIzvolteFolder ? "Da" : "Ne",
    department: e.department || "",
    entryType: labelForEntryType(e.entryType),
    description: e.description || "",
  }));
}

function labelForEntryType(value) {
  if (value === "computer") return "Računar";
  if (value === "device") return "Aparat";
  return "Nepoznato";
}
