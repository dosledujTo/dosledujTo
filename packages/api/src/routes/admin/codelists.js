// Číselníky: súdy, tagy káuz, kategórie udalostí, typy prepojení
// (admin-zadanie.md §9).
//
// Rozhodnutie, ktoré tejto obrazovke chýbalo: **číselník nie je jeden druh
// zoznamu, ale dva.**
//
//   - `court` a `case_tag` si obsah určujú samy. Hodnota, ktorá skončí
//     v dokumente, je názov súdu (`proceeding.court`), resp. kód tagu
//     (`case.tags[]`) — obyčajný reťazec, presne ako doteraz. Číselník mu dáva
//     jedno miesto, kde vzniká, a tým aj šancu filtrovať a vykazovať.
//   - `event_category` a `link_type` sú **viazané na enum**, ktorý stráži
//     `validate_doc_update`. Pridať do nich hodnotu nemá zmysel — databáza by
//     dokument s ňou odmietla — takže číselník im drží len slovenský názov ku
//     kódu a poradie v ponuke. Preto sa dá založiť iba položka s kódom z enumu
//     a preto sa kód nikdy nemení.
//
// Mazanie tu nie je a nejde o opomenutie: položka, na ktorú už niečo odkazuje,
// sa **deaktivuje** — prestane sa ponúkať, ale dokumenty, ktoré ju nesú,
// zostanú čitateľné. To je ten istý rozdiel ako medzi ukončením a zmazaním
// role.

import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import * as store from "../../../../shared/src/store.js";
import * as queries from "../../../../shared/src/queries.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { badRequest, conflict, notFound } from "../../../../shared/src/index.js";
import { adminDoc } from "../../../../shared/src/projection.js";
import * as validate from "../../middleware/validate.js";
import { requireRole, actorOf } from "../../middleware/auth.js";

export const adminCodelists = Router();

/** Ako sa číselník volá na obrazovke a čo je jeho hodnota v dokumente. */
const KINDS = {
  court: {
    label: "Súdy",
    hint: "Ponuka v konaní. Do dokumentu sa zapisuje názov súdu.",
    field: "proceeding.court",
  },
  case_tag: {
    label: "Tagy káuz",
    hint: "Ponuka pri kauze. Do dokumentu sa zapisuje kód tagu.",
    field: "case.tags[]",
  },
  event_category: {
    label: "Kategórie udalostí",
    hint: "Zoznam hodnôt drží databáza; číselník k nim dopĺňa slovenský názov.",
    field: "event.category",
  },
  link_type: {
    label: "Typy prepojení",
    hint: "Zoznam hodnôt drží databáza; číselník k nim dopĺňa slovenský názov.",
    field: "link.kind",
  },
  phase: {
    label: "Fázy konania",
    hint: "Zoznam hodnôt drží databáza. Číselník dopĺňa názov a segment metriky „Peniaze v kauzách“.",
    field: "case.phase",
  },
  case_kind: {
    label: "Druhy káuz",
    hint: "Zoznam hodnôt drží databáza; číselník k nim dopĺňa slovenský názov.",
    field: "case.kind[]",
  },
};

const boundEnum = (kind) => schemas.CODELIST_ENUMS[kind] ?? null;

/**
 * Čítať číselník musí každý, kto vypĺňa formulár — teda moderátor. Meniť ho
 * smie admin; to zariaďuje `requireRole` na zapisujúcich routách nižšie.
 */
adminCodelists.get("/", validate.query(schemas.codelistsQuery), async (req, res) => {
  const f = req.validQuery;
  const docs = await queries.codelist(f.kind);
  const [tags, courts] = await Promise.all([queries.tagUsage(), queries.courtUsage()]);

  const usageOf = (doc) => {
    if (doc.kind === "case_tag") return tags[doc.code] ?? 0;
    if (doc.kind === "court") return courts[doc.name] ?? 0;
    return null;
  };

  const kinds = f.kind ? [f.kind] : schemas.CODELIST_KINDS;
  const groups = kinds.map((kind) => {
    const items = docs
      .filter((doc) => doc.kind === kind)
      .filter((doc) => f.active === undefined || String(doc.active !== false) === f.active)
      .map((doc) => ({ ...adminDoc(doc), usage: usageOf(doc) }));

    const known = new Set(items.map((item) => item.code));
    return {
      kind,
      ...KINDS[kind],
      // Viazaný číselník sa nedopĺňa ručne: hodnoty určuje enum v databáze.
      bound_to_enum: boundEnum(kind) ?? null,
      // Kódy z enumu, ktoré ešte nemajú slovenský názov — obrazovka ich ponúkne
      // doplniť namiesto toho, aby o nich mlčala.
      missing: (boundEnum(kind) ?? []).filter((code) => !known.has(code)),
      items,
    };
  });

  // Súdy zapísané v konaniach, ktoré v číselníku nie sú. Sú to práve tie, kvôli
  // ktorým sa podľa súdu nedalo spoľahlivo filtrovať. Pri dotaze na iný číselník
  // sa nepočítajú — `docs` vtedy súdy neobsahuje a každý by vyšiel ako chýbajúci.
  const asksAboutCourts = !f.kind || f.kind === "court";
  const inCodelist = new Set(docs.filter((d) => d.kind === "court").map((d) => d.name));
  const unlisted = asksAboutCourts
    ? Object.keys(courts).filter((court) => court && !inCodelist.has(court)).sort()
    : [];

  res.json({ groups, unlisted_courts: unlisted });
});

adminCodelists.post("/", requireRole("admin"), validate.body(schemas.codelistBody), async (req, res) => {
  const { reason, ...data } = req.body;

  const allowed = boundEnum(data.kind);
  if (allowed && !allowed.includes(data.code)) {
    throw badRequest(
      `číselník ${KINDS[data.kind].label.toLowerCase()} je viazaný na hodnoty, ktoré pozná databáza: ` +
      allowed.join(", "),
    );
  }

  // Segment metriky má zmysel len pri fáze — a tam je povinný, inak by fáza
  // z metriky ticho vypadla.
  if (data.kind === "phase" && !data.bucket) throw badRequest("fáza konania musí mať segment metriky (bucket)");
  if (data.kind !== "phase" && data.bucket) throw badRequest("segment metriky (bucket) patrí len k fáze konania");

  const existing = await queries.codelist(data.kind);
  if (existing.some((doc) => doc.code === data.code)) {
    throw conflict(`kód ${data.code} v tomto číselníku už existuje`);
  }
  if (data.kind === "court" && existing.some((doc) => doc.name === data.name)) {
    throw conflict(`súd ${data.name} v číselníku už je`);
  }

  const doc = await store.createDoc({
    type: "codelist",
    data: { ...data, short_name: data.short_name ?? null, note: data.note ?? null, active: true },
    actor: actorOf(req),
    reason,
  });

  res.status(201).json({ codelist: adminDoc(doc) });
});

adminCodelists.patch("/:id", requireRole("admin"), validate.body(schemas.codelistPatchBody), async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "codelist") throw notFound("položka číselníka");

  const { reason, ...patch } = req.body;
  if (Object.keys(patch).length === 0) throw badRequest("nie je čo meniť");
  if (patch.bucket && doc.kind !== "phase") throw badRequest("segment metriky (bucket) patrí len k fáze konania");

  // Premenovanie súdu by osirelo konania, ktoré nesú starý názov: hodnota
  // v dokumente je názov, nie odkaz. Preto sa dá premenovať len súd, ktorý
  // zatiaľ nikto nepoužil.
  if (doc.kind === "court" && patch.name && patch.name !== doc.name) {
    const usage = (await queries.courtUsage())[doc.name] ?? 0;
    if (usage > 0) {
      throw badRequest(
        `súd je vedený v ${usage} konaniach a jeho názov je v nich zapísaný ako hodnota; ` +
        "založ nový súd a tento deaktivuj",
      );
    }
  }

  const updated = await store.updateDoc({
    id: doc._id,
    patch,
    actor: actorOf(req),
    reason,
  });

  res.json({ codelist: adminDoc(updated) });
});
