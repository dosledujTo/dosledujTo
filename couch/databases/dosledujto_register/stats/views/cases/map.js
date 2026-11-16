// Jeden riadok na zverejnenú kauzu so všetkým, čo potrebujú metriky titulky
// (handoff „Červená niť" kap. 6): suma, vrátené peniaze, fáza, druh, dopad.
// Bez neho by sa „Peniaze v kauzách" počítali dočítaním všetkých dokumentov.
//
//   ?reduce=false (view nemá reduce)
//
// Suma je **najvyššia zdrojovaná** hodnota — pri spornej sume vyššia verzia
// (pravidlo 1 v kap. 6.1). Údaj bez zdroja sa nepočíta, rovnako ako sa
// nezverejní.

import { value } from "../../../../../shared/sourced.js";

export default function (doc) {
  if (doc.type !== "case" || doc.publish_state !== "published") return;

  var amount = null;
  if (doc.amount && doc.amount.sources && doc.amount.sources.length && typeof doc.amount.value === "number") {
    amount = doc.amount.value;
  }
  var disputed = (doc.amount && doc.amount.disputed) || [];
  for (var i = 0; i < disputed.length; i++) {
    var alt = disputed[i];
    if (alt && typeof alt.value === "number" && alt.sources && alt.sources.length) {
      if (amount === null || alt.value > amount) amount = alt.value;
    }
  }

  var recovered = null;
  if (doc.recovered_amount && doc.recovered_amount.sources && doc.recovered_amount.sources.length &&
      typeof doc.recovered_amount.value === "number") {
    recovered = doc.recovered_amount.value;
  }

  var kinds = doc.kind && doc.kind.sources && doc.kind.sources.length ? value(doc.kind) : null;
  var impact = doc.impact && doc.impact.sources && doc.impact.sources.length ? value(doc.impact) : null;

  emit(doc._id, {
    title: doc.title || null,
    slug: doc.slug || null,
    amount: amount,
    disputed: disputed.length > 0,
    recovered: recovered,
    phase: doc.phase && doc.phase.sources && doc.phase.sources.length ? value(doc.phase) : null,
    status: doc.status && doc.status.sources && doc.status.sources.length ? value(doc.status) : null,
    kinds: kinds || [],
    impact: impact,
    summary: doc.summary && doc.summary.sources && doc.summary.sources.length ? value(doc.summary) : null,
    started_on: doc.started_on || null,
  });
}
