// One index over `case`, `person` and `org`, so a single query serves both
// /api/search and the filtering on /api/cases (backend-zadanie.md §2.3).
//
// Every searchable text field is indexed twice: once as written, once folded
// (no diacritics, lowercase) into `<field>_fold`. Clouseau has no Slovak
// analyzer, so this is what makes "kotlar" find "Kotlár". Inflected forms stay
// the job of `name_variants`, not of Lucene.

import { fold } from "../../../../../shared/normalize.js";
import { value, sources, epoch } from "../../../../../shared/sourced.js";

export default function (doc) {
  var type = doc.type;
  if (type !== "case" && type !== "person" && type !== "org") return;

  // Aj skryté dokumenty patria do indexu. Verejné dotazy vždy pridávajú
  // `publish_state:"published"`, takže von sa nedostanú — ale moderátor musí
  // vedieť nájsť to, čo niekto skryl. Vynechať ich z indexu by znamenalo, že
  // skrytie je zároveň zmiznutie, a to je presne ten druh tichej straty, ktorý
  // register nesmie mať.
  index("type", type, { store: true, facet: true });
  // `facet: true` je potrebné pre počty vo filtroch administrácie — bez neho
  // Clouseau odmietne `counts` s hláškou, že dimenzia neexistuje.
  index("publish_state", doc.publish_state || "draft", { store: true, facet: true });
  if (doc.slug) index("slug", doc.slug, { store: true });

  // Display name: `title` for a case, `full_name` for a person, `name` for an org.
  var title = type === "case" ? doc.title : type === "person" ? doc.full_name : doc.name;
  if (title) {
    index("title", title, { store: true });
    index("title_fold", fold(title), { store: false });
  }

  // Name variants carry the inflected and transliterated forms the crawler and
  // the search box both need (pády, prechyľovanie, iniciály z policajných správ).
  var variants = doc.name_variants || [];
  for (var i = 0; i < variants.length; i++) {
    if (!variants[i]) continue;
    index("variant", variants[i], { store: false });
    index("variant_fold", fold(variants[i]), { store: false });
  }

  var summary = value(doc.summary) || value(doc.short_bio);
  if (typeof summary === "string" && summary) {
    index("summary", summary, { store: true });
    index("summary_fold", fold(summary), { store: false });
  }

  var status = value(doc.status);
  if (status) index("status", status, { store: true, facet: true });

  var phase = value(doc.phase);
  if (phase) index("phase", phase, { store: true, facet: true });

  // Druh kauzy (pole kódov, prvý je hlavný). `case_kind` je viachodnotové pre
  // filter, `kind_main` jednohodnotové pre fasetu a kartu. Meno nie je `kind`,
  // to už patrí druhu subjektu (strana, firma, inštitúcia).
  if (type === "case") {
    var kinds = value(doc.kind);
    var hasKind = Object.prototype.toString.call(kinds) === "[object Array]" && kinds.length > 0;
    // Explicitne, lebo „pole chýba" sa v Lucene pýta zle — zoznam káuz bez
    // druhu je pracovný zoznam moderátora.
    index("has_kind", hasKind ? "true" : "false", { store: false, facet: true });
    if (hasKind) {
      for (var k = 0; k < kinds.length; k++) {
        if (kinds[k]) index("case_kind", kinds[k], { store: false, facet: true });
      }
      if (kinds[0]) index("kind_main", kinds[0], { store: true, facet: true });
      // Všetky druhy v poradí, na kartu v zozname (viachodnotové pole sa
      // z indexu vracia raz ako reťazec, raz ako pole).
      index("kind_list", kinds.join(","), { store: true });
    }
    // Dopad nefinančnej kauzy sa zobrazí len so zdrojom; bez neho sa ani
    // neindexuje, aby ho zoznam neukázal.
    var impact = value(doc.impact);
    if (impact && typeof impact === "object" && typeof impact.value === "number" && sources(doc.impact).length > 0) {
      index("has_impact", "true", { store: true });
      index("impact_value", impact.value, { store: true });
      if (typeof impact.unit === "string") index("impact_unit", impact.unit, { store: true });
    }
  }

  // Amount in cents as an integer (backend-zadanie.md §4). Indexed as a number
  // so `amount:[100000000 TO 5000000000]` and sorting work.
  var amount = value(doc.amount);
  if (typeof amount === "number") {
    index("amount", amount, { store: true, facet: true });
    index("has_amount", "true", { store: false });
  }

  var started = epoch(doc.started_on);
  if (started !== null) index("started_on", started, { store: true });

  var closed = epoch(doc.closed_on);
  if (closed !== null) index("closed_on", closed, { store: true });

  var updated = epoch(doc.updated_at);
  if (updated !== null) index("updated_at", updated, { store: true });

  var tags = doc.tags || [];
  for (var t = 0; t < tags.length; t++) {
    if (tags[t]) index("tag", tags[t], { store: true, facet: true });
  }

  // `person_ids` and `party_ids` are denormalised onto the case by the write
  // layer in `shared`. Lucene cannot join, and filtering cases by person or by
  // political party is a headline feature (produktové zadanie §4.1).
  var people = doc.person_ids || [];
  for (var p = 0; p < people.length; p++) {
    if (people[p]) index("person_id", people[p], { store: false });
  }
  // Počet do zoznamu. Pole `person_id` je viachodnotové a z indexu sa vracia raz
  // ako reťazec a raz ako pole — počítať ho na klientovi je zdroj chýb.
  index("person_count", people.length, { store: true });
  var parties = doc.party_ids || [];
  for (var q = 0; q < parties.length; q++) {
    if (parties[q]) index("party_id", parties[q], { store: true, facet: true });
  }

  // Priradení moderátori (admin-zadanie.md §5.3). Filter „len moje kauzy" je
  // najdôležitejší filter v zozname, takže musí ísť cez index — nie cez
  // dočítavanie na klientovi.
  var moderators = doc.moderator_ids || [];
  for (var m = 0; m < moderators.length; m++) {
    if (moderators[m]) index("moderator_id", moderators[m], { store: true });
  }
  index("moderator_count", moderators.length, { store: true });
  index("has_moderator", moderators.length > 0 ? "true" : "false", { store: true, facet: true });

  if (type === "org" && doc.kind) index("kind", doc.kind, { store: true, facet: true });
  if (type === "org" && doc.ico) index("ico", doc.ico, { store: true });
  if (type === "person" && doc.birth_year) index("birth_year", doc.birth_year, { store: true });

  // Sourcing coverage, so the moderation UI can list what is still unsourced
  // without reading every document.
  var sourced = countSourced(doc);
  index("sources_count", sourced.total, { store: true });
  if (sourced.unsourced > 0) index("has_unsourced", "true", { store: false });

  // Catch-all free-text field. `default_field` in meta.json points here, so a
  // bare query string searches names, variants and summary at once.
  var all = [title, summary].concat(variants).concat(doc.tags || []);
  var text = "";
  for (var a = 0; a < all.length; a++) {
    if (typeof all[a] === "string") text += " " + all[a];
  }
  if (text) index("text", fold(text), { store: false });
}

/**
 * Count sourced fields on a document and how many still lack a source.
 * @param {object} doc
 */
function countSourced(doc) {
  var total = 0;
  var unsourced = 0;
  for (var key in doc) {
    if (!Object.prototype.hasOwnProperty.call(doc, key)) continue;
    if (key.charAt(0) === "_") continue;
    var field = doc[key];
    if (!field || typeof field !== "object") continue;
    if (Object.prototype.toString.call(field.sources) !== "[object Array]") continue;
    total++;
    if (sources(field).length === 0) unsourced++;
  }
  return { total: total, unsourced: unsourced };
}
