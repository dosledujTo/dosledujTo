// Metriky titulky (handoff „Červená niť" kap. 6, 9). Pravidlá sú rozhodnutia,
// preto majú vlastné testy: keď sa zmenia, musí to byť zámer, nie náhoda.

import { describe, expect, it } from "vitest";
import {
  buzzScore, caseBucket, isForgotten, moneyBreakdown, spark,
} from "../packages/shared/src/metrics.js";
import { app, request } from "./helpers.js";

const PHASES = {
  investigation: "investigation", charges: "charge", indictment: "trial", trial: "trial", appeal: "trial",
  convicted: "convicted", acquitted: "acquitted", halted: "discontinued", lapsed: "lapsed",
};

describe("zaradenie do segmentov (kap. 6.1)", () => {
  it("podľa najďalšej fázy z číselníka; bez fázy „bez trestného konania“", () => {
    expect(caseBucket({ phase: "appeal" }, PHASES).bucket).toBe("trial");
    expect(caseBucket({ phase: "charges" }, PHASES).bucket).toBe("charge");
    expect(caseBucket({ phase: null }, PHASES).bucket).toBe("none");
    expect(caseBucket({ phase: "neznama" }, PHASES).bucket).toBe("none");
  });

  it("viac obvinených s rôznym koncom: najzávažnejší výsledok, odvodene a s popisom", () => {
    const b = caseBucket({ phase: "acquitted", status: "closed", outcomes: ["acquitted", "convicted"] }, PHASES);
    expect(b.bucket).toBe("convicted");
    expect(b.derived).toBe(true);
    expect(b.derivation).toMatch(/odsúdenie > oslobodenie > zastavené > premlčané/);
  });

  it("rovnaký koniec všetkých nie je odvodený údaj", () => {
    const b = caseBucket({ phase: "convicted", status: "closed", outcomes: ["convicted", "convicted"] }, PHASES);
    expect(b).toEqual({ bucket: "convicted", derived: false, derivation: null });
  });

  it("otvorenú kauzu výsledok jedného obvineného neuzavrie", () => {
    expect(caseBucket({ phase: "trial", status: "open", outcomes: ["acquitted"] }, PHASES).bucket).toBe("trial");
  });

  it("súčet segmentov je suma spolu; kauza bez sumy ide medzi nefinančné, nie do nuly", () => {
    const cases = [
      { id: "a", amount: 1000, recovered: 100, phase: "trial", status: "open", kinds: ["public_money"] },
      { id: "b", amount: 500, recovered: null, phase: "convicted", status: "closed", kinds: ["public_money"] },
      { id: "c", amount: null, recovered: null, phase: "investigation", status: "open", kinds: ["investigation_interference"] },
      { id: "d", amount: 0, recovered: null, phase: null, status: "open", kinds: ["abuse_of_power"] },
    ];
    const m = moneyBreakdown(cases, new Map(), PHASES);
    expect(m.amount).toBe(1500);
    expect(m.buckets.reduce((s, b) => s + b.amount, 0)).toBe(m.amount);
    expect(m.amount_closed).toBe(500);
    expect(m.cases_with_amount).toBe(2);
    expect(m.recovered).toBe(100);
    expect(m.non_money).toEqual([
      { kind: "investigation_interference", cases: 1 },
      { kind: "abuse_of_power", cases: 1 },
    ]);
  });
});

describe("najviac sa píše (kap. 6.2)", () => {
  it("jedno médium, ktoré píše každý deň, kauzu nevytiahne", () => {
    expect(buzzScore(30, 1)).toBeCloseTo(Math.sqrt(30), 5);
    expect(buzzScore(10, 10)).toBe(10);
    expect(buzzScore(10, 10)).toBeGreaterThan(buzzScore(30, 1));
    expect(buzzScore(0, 0)).toBe(0);
  });

  it("krivka má 24 mesiacov a končí aktuálnym mesiacom", () => {
    const s = spark([{ day: "2026-11-02", count: 3 }, { day: "2024-12-31", count: 2 }, { day: "2024-11-30", count: 9 }], "2026-11-15");
    expect(s).toHaveLength(24);
    expect(s.at(-1)).toBe(3);
    expect(s[0]).toBe(2);
    expect(s.reduce((a, b) => a + b, 0)).toBe(5); // 11/2024 je mimo okna
  });
});

describe("zabudnuté, ale nevyriešené (kap. 6.3)", () => {
  const opts = { now: "2026-11-15", minArticles: 20, silenceDays: 365 };
  it("otvorená, aspoň 20 článkov, viac ako rok ticho", () => {
    expect(isForgotten({ open: true, total: 25, lastArticle: "2025-10-01" }, opts)).toBe(true);
  });
  it("nie, ak je uzavretá, má málo článkov alebo sa o nej písalo", () => {
    expect(isForgotten({ open: false, total: 25, lastArticle: "2024-01-01" }, opts)).toBe(false);
    expect(isForgotten({ open: true, total: 19, lastArticle: "2024-01-01" }, opts)).toBe(false);
    expect(isForgotten({ open: true, total: 25, lastArticle: "2026-01-01" }, opts)).toBe(false);
  });
});

describe("API metrík", () => {
  it("/stats: súčet segmentov sedí so sumou a nefinančné kauzy sú zvlášť", async () => {
    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(200);
    const sum = res.body.money.buckets.reduce((s, b) => s + b.amount, 0);
    expect(sum).toBe(res.body.amount);
    expect(res.body.money.buckets.map((b) => b.bucket)).toEqual(
      ["none", "investigation", "charge", "trial", "convicted", "acquitted", "discontinued", "lapsed"]);
    expect(res.body.non_money.length).toBeGreaterThan(0);
    expect(res.body.official_share).toBeGreaterThan(0);
    expect(res.body.top_entities.length).toBeGreaterThan(0);
    // Pravidlo 3 sa v generovaných dátach uplatní a nesie popis.
    for (const d of res.body.money.derived) expect(d.derivation).toBeTruthy();
  });

  it("/cases/top: zoradené podľa skóre, krivka 24 mesiacov", async () => {
    for (const period of ["30d", "12m", "all"]) {
      const res = await request(app).get("/api/cases/top").query({ period, limit: 5 });
      expect(res.status).toBe(200);
      const scores = res.body.items.map((i) => i.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      for (const i of res.body.items) expect(i.spark).toHaveLength(24);
    }
    const all = await request(app).get("/api/cases/top").query({ period: "all" });
    expect(all.body.items.every((i) => i.trend === null)).toBe(true);
  });

  it("/cases/forgotten: len otvorené s tichom dlhším ako rok", async () => {
    const res = await request(app).get("/api/cases/forgotten").query({ limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(3);
    for (const i of res.body.items) {
      expect(["convicted", "acquitted", "discontinued", "lapsed"]).not.toContain(i.bucket);
      expect(i.total_articles).toBeGreaterThanOrEqual(res.body.rules.min_articles);
      expect(Date.now() - Date.parse(i.last_article)).toBeGreaterThan(res.body.rules.silence_days * 86_400_000);
    }
  });

  it("/cases/latest: posledný pohyb je článok alebo udalosť, ktorá sa už stala", async () => {
    const res = await request(app).get("/api/cases/latest").query({ limit: 3 });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    const dates = res.body.items.map((i) => i.latest_change.at);
    expect(dates).toEqual([...dates].sort().reverse());
    for (const i of res.body.items) {
      expect(["article", "event"]).toContain(i.latest_change.type);
      expect(Date.parse(i.latest_change.at)).toBeLessThanOrEqual(Date.now());
    }
  });

  it("nové routy nezachytia slug kauzy a slug ich nezachytí", async () => {
    expect((await request(app).get("/api/cases/top")).status).toBe(200);
    expect((await request(app).get("/api/cases/kauza-testovaci-most")).status).toBe(200);
  });
});

describe("kalendár a verejná konfigurácia", () => {
  it("/events/calendar: len budúce očakávané udalosti, súd z konania, filter podľa súdu", async () => {
    const res = await request(app).get("/api/events/calendar");
    expect(res.status).toBe(200);
    const today = new Date().toISOString().slice(0, 10);
    expect(res.body.items.every((e) => e.occurred_on.slice(0, 10) >= today)).toBe(true);
    const court = res.body.facets.courts[0]?.court;
    if (court) {
      const filtered = await request(app).get("/api/events/calendar").query({ court });
      expect(filtered.body.items.every((e) => e.court === court)).toBe(true);
      expect(filtered.body.total).toBe(res.body.facets.courts[0].count);
    }
  });

  it("/public-config nevracia nič tajné", async () => {
    const res = await request(app).get("/api/public-config");
    expect(Object.keys(res.body)).toEqual(["turnstile_site_key"]);
  });
});
