// Generované testovacie dáta (couch/fixtures/generate.js) — kontrola nad
// súbormi, bez databázy. Overuje, že dáta pokrývajú to, kvôli čomu existujú
// (handoff „Červená niť" kap. 7.5), a že neporušujú pravidlá registra: každý
// zdroj existuje, žiadna rola nekončí pred začiatkom, všetko je fiktívne.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const DIR = path.resolve("couch/fixtures/dosledujto_register");
const REF = "2026-11-15";
const DAY = 86_400_000;

const all = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")));
const generated = readdirSync(DIR)
  .filter((f) => /^7\d-gen-/.test(f))
  .flatMap((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")));
const byType = (list, type) => list.filter((d) => d.type === type);

const articles = new Map(byType(all, "article").map((a) => [a._id, a]));
const cases = byType(generated, "case");
const allCases = byType(all, "case");
const bucketOf = Object.fromEntries(
  byType(all, "codelist").filter((c) => c.kind === "phase").map((c) => [c.code, c.bucket]),
);
const bucket = (c) => (c.phase?.value ? bucketOf[c.phase.value] : "none");
const CLOSED = new Set(["convicted", "acquitted", "discontinued", "lapsed"]);

describe("generované fixtures — rozsah (kap. 7.5)", () => {
  it("dosť káuz, osôb, subjektov a článkov", () => {
    expect(allCases.length).toBeGreaterThanOrEqual(50);
    expect(byType(all, "person").length).toBeGreaterThanOrEqual(300);
    expect(byType(all, "org").length).toBeGreaterThanOrEqual(120);
    expect(articles.size).toBeGreaterThanOrEqual(1900);
  });

  it("články sú rozložené v rokoch 2019–2026", () => {
    const years = new Set([...articles.values()].map((a) => a.published_at.slice(0, 4)));
    for (let y = 2019; y <= 2026; y++) expect(years).toContain(String(y));
  });

  it("aspoň 8 nefinančných káuz a všetky druhy", () => {
    const nonMoney = cases.filter((c) => c.kind.value[0] !== "public_money");
    expect(nonMoney.length).toBeGreaterThanOrEqual(8);
    expect(nonMoney.every((c) => !c.amount)).toBe(true);
    const kinds = new Set(cases.flatMap((c) => c.kind.value));
    for (const k of ["public_money", "investigation_interference", "abuse_of_power",
      "elections_party_finance", "conflict_of_interest", "other"]) {
      expect(kinds).toContain(k);
    }
  });

  it("všetky segmenty metriky sú pokryté", () => {
    const buckets = new Set(cases.filter((c) => c.amount).map(bucket));
    for (const b of ["none", "investigation", "charge", "trial", "convicted", "acquitted", "discontinued", "lapsed"]) {
      expect(buckets).toContain(b);
    }
  });

  it("aspoň 3 sporné sumy a nejaké vrátené peniaze", () => {
    expect(cases.filter((c) => c.amount?.disputed?.length).length).toBeGreaterThanOrEqual(3);
    expect(cases.filter((c) => c.recovered_amount).length).toBeGreaterThan(0);
  });

  it("aspoň 3 zabudnuté kauzy: otvorené, ≥ 20 článkov, rok ticho", () => {
    const perCase = new Map();
    for (const a of articles.values()) {
      for (const id of a.case_ids) (perCase.get(id) ?? perCase.set(id, []).get(id)).push(a.published_at);
    }
    const forgotten = cases.filter((c) => {
      const dates = perCase.get(c._id) ?? [];
      const last = dates.sort().at(-1);
      return !CLOSED.has(bucket(c)) && dates.length >= 20 && Date.parse(REF) - Date.parse(last) > 365 * DAY;
    });
    expect(forgotten.length).toBeGreaterThanOrEqual(3);
  });

  it("aspoň 2 kauzy majú termín v najbližších 30 dňoch", () => {
    const soon = byType(generated, "event").filter((e) =>
      e.kind === "expected" && e.occurred_on > REF && Date.parse(e.occurred_on) - Date.parse(REF) <= 30 * DAY);
    expect(new Set(soon.map((e) => e.case_id)).size).toBeGreaterThanOrEqual(2);
  });

  it("Sieť do dvoch krokov má pri niektorej osobe viac ako 60 uzlov", () => {
    const edges = new Map();
    const add = (a, b) => {
      (edges.get(a) ?? edges.set(a, new Set()).get(a)).add(b);
      (edges.get(b) ?? edges.set(b, new Set()).get(b)).add(a);
    };
    for (const l of byType(all, "link")) add(l.from_id, l.to_id);
    for (const r of byType(all, "role")) add(r.person_id ?? r.org_id, r.case_id);
    const reach = (start) => {
      const one = edges.get(start) ?? new Set();
      const two = new Set(one);
      for (const n of one) for (const m of edges.get(n) ?? []) two.add(m);
      two.delete(start);
      return two.size;
    };
    const best = Math.max(...byType(all, "person").map((p) => reach(p._id)));
    expect(best).toBeGreaterThan(60);
  });
});

describe("generované fixtures — pravidlá registra", () => {
  it("každý zdroj existuje ako článok", () => {
    const missing = [];
    const check = (owner, ids) => {
      for (const id of ids ?? []) if (!articles.has(id)) missing.push(`${owner}: ${id}`);
    };
    for (const doc of generated) {
      if (Array.isArray(doc.sources)) check(doc._id, doc.sources);
      for (const [key, v] of Object.entries(doc)) {
        if (v && typeof v === "object" && Array.isArray(v.sources)) {
          check(`${doc._id}.${key}`, v.sources);
          for (const alt of v.disputed ?? []) check(`${doc._id}.${key}~`, alt.sources);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("zverejnená kauza má druh a každé zdrojované pole má zdroj", () => {
    for (const c of cases.filter((x) => x.publish_state === "published")) {
      expect(c.kind?.value?.length, c._id).toBeGreaterThan(0);
      for (const [key, v] of Object.entries(c)) {
        if (v && typeof v === "object" && Array.isArray(v.sources)) expect(v.sources.length, `${c._id}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("kauza bez sumy nemá „0 €“ — buď dopad, alebo nič", () => {
    for (const c of cases.filter((x) => !x.amount)) {
      if (c.impact) expect(typeof c.impact.value.value).toBe("number");
    }
    expect(cases.some((c) => c.amount?.value === 0)).toBe(false);
  });

  it("žiadna rola nekončí pred začiatkom a história sa neprepisuje", () => {
    for (const r of byType(generated, "role")) {
      if (r.valid_to) expect(r.valid_to >= r.valid_from, r._id).toBe(true);
    }
  });

  it("osoby v kauze sú denormalizované na kauze", () => {
    for (const c of cases) {
      const fromRoles = new Set(byType(generated, "role").filter((r) => r.case_id === c._id && r.person_id).map((r) => r.person_id));
      expect(new Set(c.person_ids)).toEqual(fromRoles);
    }
  });

  it("udalosť s konaním ukazuje na konanie tej istej kauzy", () => {
    const proceedings = new Map(byType(all, "proceeding").map((p) => [p._id, p]));
    for (const e of byType(all, "event").filter((x) => x.proceeding_id)) {
      expect(proceedings.get(e.proceeding_id)?.case_id, e._id).toBe(e.case_id);
    }
  });

  it("všetko je fiktívne: domény *.example, žiadne IČO", () => {
    for (const a of byType(generated, "article")) {
      expect(new URL(a.url).hostname, a._id).toMatch(/\.example$/);
    }
    expect(byType(generated, "org").every((o) => o.ico === null)).toBe(true);
  });

  it("generátor je deterministický", () => {
    const hash = () =>
      createHash("sha256")
        .update(readdirSync(DIR).filter((f) => /^7\d-gen-/.test(f)).sort()
          .map((f) => readFileSync(path.join(DIR, f), "utf8")).join("\n"))
        .digest("hex");
    const before = hash();
    execFileSync(process.execPath, ["couch/fixtures/generate.js"], { stdio: "ignore" });
    expect(hash()).toBe(before);
  });
});
