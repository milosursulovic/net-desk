import { bulkInsertFlaggedDomains } from "../repositories/dnsLogs.repo.js";

// Hand-curated list of the major video-streaming platforms - unlike
// social/gambling/porn below, there's no standard, actively maintained "blocklist"
// category for this, so this is a short, stable list of known services (not a
// feed of thousands of CDN subdomains).
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

// hosts-file format ("0.0.0.0 domain.com" / "127.0.0.1 domain.com", one
// per line) - the format used by all StevenBlack/hosts feeds.
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

// URLhaus CSV ("id","dateadded","url","url_status",...) - extracts the host from the
// url column, skips IP addresses (URLhaus URLs often point directly at an IP,
// not a domain - that's not something flagged_domains can match).
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

// Each source is independent - if one feed fails (network problem, the source
// changed its URL/format), the others still sync, the whole
// job isn't aborted. INSERT IGNORE (bulkInsertFlaggedDomains) means manually added/
// already existing domains are never overwritten or deleted - this is purely
// additive, the same for all sources.
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
