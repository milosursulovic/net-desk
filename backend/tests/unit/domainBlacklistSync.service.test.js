import { describe, it, expect } from "vitest";
import {
  parseHostsFileDomains,
  parseUrlhausCsvDomains,
  STREAMING_DOMAINS,
} from "../../services/domainBlacklistSync.service.js";

describe("parseHostsFileDomains", () => {
  it("extracts domains from 0.0.0.0 and 127.0.0.1 lines", () => {
    const text = [
      "# comment line, ignored",
      "0.0.0.0 example.com",
      "127.0.0.1 sub.example.org",
      "",
      "not a hosts line",
    ].join("\n");
    expect(parseHostsFileDomains(text)).toEqual(["example.com", "sub.example.org"]);
  });

  it("lowercases domains and dedupes", () => {
    const text = "0.0.0.0 Example.COM\n0.0.0.0 example.com\n127.0.0.1 example.com";
    expect(parseHostsFileDomains(text)).toEqual(["example.com"]);
  });

  it("skips a bare localhost entry", () => {
    const text = "127.0.0.1 localhost\n0.0.0.0 real-domain.com";
    expect(parseHostsFileDomains(text)).toEqual(["real-domain.com"]);
  });

  it("returns an empty array for text with no hosts-file lines", () => {
    expect(parseHostsFileDomains("# just a header\n# nothing else")).toEqual([]);
  });
});

describe("parseUrlhausCsvDomains", () => {
  it("extracts the hostname from the url column, skipping comment/header lines", () => {
    const text = [
      "# abuse.ch URLhaus Database Dump",
      "# id,dateadded,url,url_status,last_online,threat,tags,urlhaus_link,reporter",
      '"1","2026-01-01 00:00:00","http://malicious-example.com/payload.exe","online","2026-01-01 00:00:00","malware_download","None","https://urlhaus.abuse.ch/url/1/","reporter"',
    ].join("\n");
    expect(parseUrlhausCsvDomains(text)).toEqual(["malicious-example.com"]);
  });

  it("excludes IPv4-hosted URLs (not something flagged_domains can match)", () => {
    const text = '"1","2026-01-01","http://10.0.0.5:8080/i","online","2026-01-01","malware_download","None","link","reporter"';
    expect(parseUrlhausCsvDomains(text)).toEqual([]);
  });

  it("excludes a bare hostname with no dot", () => {
    const text = '"1","2026-01-01","http://localhost/x","online","2026-01-01","malware_download","None","link","reporter"';
    expect(parseUrlhausCsvDomains(text)).toEqual([]);
  });

  it("dedupes repeated hosts across multiple URL rows", () => {
    const text = [
      '"1","2026-01-01","http://bad.example.com/a","online","2026-01-01","malware_download","None","link","reporter"',
      '"2","2026-01-01","http://bad.example.com/b","online","2026-01-01","malware_download","None","link","reporter"',
    ].join("\n");
    expect(parseUrlhausCsvDomains(text)).toEqual(["bad.example.com"]);
  });

  it("skips malformed lines instead of throwing", () => {
    const text = "not,a,valid,csv,line\n\n###";
    expect(parseUrlhausCsvDomains(text)).toEqual([]);
  });
});

describe("STREAMING_DOMAINS", () => {
  it("is a non-empty list of lowercase, dot-containing domains", () => {
    expect(STREAMING_DOMAINS.length).toBeGreaterThan(0);
    for (const d of STREAMING_DOMAINS) {
      expect(d).toBe(d.toLowerCase());
      expect(d).toContain(".");
    }
  });
});
