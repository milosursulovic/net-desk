import { bulkInsertFlaggedDomains } from "../repositories/dnsLogs.repo.js";

// Ručno kurirana lista glavnih video-streaming platformi - za razliku od
// social/gambling/porn ispod, nema standardnu, aktivno održavanu "blocklist"
// kategoriju za ovo, pa je ovo kratka, stabilna lista poznatih servisa (ne
// feed od hiljada CDN poddomena).
export const STREAMING_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "netflix.com",
  "twitch.tv",
  "disneyplus.com",
  "hulu.com",
  "primevideo.com",
  "max.com",
  "hbomax.com",
  "tiktok.com",
  "vimeo.com",
  "dailymotion.com",
  "peacocktv.com",
  "paramountplus.com",
  "tv.apple.com",
  "crunchyroll.com",
  "pluto.tv",
  "rumble.com",
];

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

// hosts-fajl format ("0.0.0.0 domain.com" / "127.0.0.1 domain.com", jedan
// po liniji) - format koji koriste svi StevenBlack/hosts feed-ovi.
export function parseHostsFileDomains(text) {
  const domains = new Set();
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*(?:0\.0\.0\.0|127\.0\.0\.1)\s+(\S+)/);
    if (!match) continue;
    const domain = match[1].trim().toLowerCase();
    if (domain && domain !== "localhost") domains.add(domain);
  }
  return [...domains];
}

// URLhaus CSV ("id","dateadded","url","url_status",...) - izvlači host iz
// url kolone, preskače IP-adrese (URLhaus URL-ovi su često direktno na IP,
// ne na domenu - to nije nešto što flagged_domains ume da matchuje).
export function parseUrlhausCsvDomains(text) {
  const domains = new Set();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^"[^"]*","[^"]*","([^"]*)"/);
    if (!match) continue;
    let host;
    try {
      host = new URL(match[1]).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (!host || IPV4_RE.test(host) || host.includes(":") || !host.includes(".")) continue;
    domains.add(host);
  }
  return [...domains];
}

const FETCH_TIMEOUT_MS = 30000;

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Svaki izvor je nezavisan - ako jedan feed padne (mrežni problem, izvor
// promenio URL/format), ostali se i dalje sinhronizuju, ne prekida se ceo
// posao. INSERT IGNORE (bulkInsertFlaggedDomains) znači da se ručno dodati/
// već postojeći domeni nikad ne prepisuju niti brišu - ovo je čisto
// dodavanje, isto za sve izvore.
const FETCHED_SOURCES = [
  {
    name: "URLhaus malware (abuse.ch)",
    url: "https://urlhaus.abuse.ch/downloads/csv_recent/",
    parse: parseUrlhausCsvDomains,
    reason: "Malware distribucija (URLhaus/abuse.ch)",
  },
  {
    name: "StevenBlack društvene mreže",
    url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/social-only/hosts",
    parse: parseHostsFileDomains,
    reason: "Društvena mreža (StevenBlack social blocklist)",
  },
  {
    name: "StevenBlack kockanje",
    url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-only/hosts",
    parse: parseHostsFileDomains,
    reason: "Kockanje (StevenBlack gambling blocklist)",
  },
  {
    name: "StevenBlack pornografija",
    url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts",
    parse: parseHostsFileDomains,
    reason: "Pornografija (StevenBlack porn blocklist)",
  },
];

export async function syncDomainBlacklists() {
  const results = [];

  for (const source of FETCHED_SOURCES) {
    try {
      const text = await fetchText(source.url);
      const domains = source.parse(text);
      const inserted = await bulkInsertFlaggedDomains(
        domains.map((domain) => ({ domain, reason: source.reason })),
      );
      results.push({ source: source.name, fetched: domains.length, inserted });
    } catch (err) {
      results.push({ source: source.name, error: err?.message || String(err) });
    }
  }

  try {
    const inserted = await bulkInsertFlaggedDomains(
      STREAMING_DOMAINS.map((domain) => ({
        domain,
        reason: "Video striming platforma (kurirana lista)",
      })),
    );
    results.push({ source: "Video streaming (kurirano)", fetched: STREAMING_DOMAINS.length, inserted });
  } catch (err) {
    results.push({ source: "Video streaming (kurirano)", error: err?.message || String(err) });
  }

  return results;
}
