// „Naposledy sa pohlo" (handoff „Červená niť" kap. 5.1, rozhodnutie vlastníka F).
//
// Pohyb = posledný priradený článok alebo udalosť, ktorá sa už stala (view
// `stats/latest`, jeden dotaz pre všetky kauzy). Ak verejný údaj kauzy po tomto
// pohybe zmenila revízia, ukáže sa aj tá — označená „oprava", lebo je to
// zmena toho, čo register tvrdí, a čitateľ o nej má vedieť.

import * as couch from "../../../shared/src/couch.js";
import * as queries from "../../../shared/src/queries.js";
import * as metrics from "../../../shared/src/metrics.js";

/** Polia kauzy, ktorých zmena je pre čitateľa „oprava". */
const PUBLIC_FIELDS = new Set(["title", "summary", "status", "phase", "amount", "kind", "impact", "recovered_amount", "related_case_ids"]);

/** @param {number} limit */
export async function latestCases(limit) {
  const [rows, cases, outcomes, buckets, pairs] = await Promise.all([
    couch.view("stats", "latest", { group: true }),
    metrics.caseRows(),
    metrics.outcomesByCase(),
    metrics.phaseBuckets(),
    metrics.entityCasePairs(),
  ]);
  const byId = new Map(cases.map((c) => [c.id, c]));
  const latest = rows.rows
    .filter((r) => byId.has(r.key) && r.value)
    .sort((a, b) => b.value[0] - a.value[0])
    .slice(0, limit);

  // Revízie len pre vybrané kauzy — `limit` dotazov, nie jeden na každú kauzu.
  const revisions = await Promise.all(latest.map((r) => queries.revisionsOfTarget(r.key)));

  return latest.map((r, i) => {
    const [at, type, title, extra] = r.value;
    const people = pairs.filter((p) => p.case_id === r.key);
    const correction = revisions[i]
      .filter((rev) => Date.parse(rev.at) > at)
      .map((rev) => ({
        at: rev.at,
        fields: [...new Set((rev.diff ?? []).map((op) => op.path.split("/")[1]).filter((f) => PUBLIC_FIELDS.has(f)))],
      }))
      .filter((rev) => rev.fields.length > 0)
      .at(-1) ?? null;
    return {
      ...metrics.caseCard(byId.get(r.key), outcomes, buckets),
      persons: people.filter((p) => p.entity.startsWith("person:")).length,
      orgs: people.filter((p) => p.entity.startsWith("org:")).length,
      latest_change: {
        at: new Date(at).toISOString(),
        type,
        title,
        publisher: type === "article" ? extra : null,
        category: type === "event" ? extra : null,
      },
      correction,
    };
  });
}
