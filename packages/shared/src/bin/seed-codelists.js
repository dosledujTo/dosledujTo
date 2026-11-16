// Doplnenie chýbajúcich položiek číselníkov, bez ktorých nová verzia nefunguje
// správne: `phase` (s `bucket` pre metriku „Peniaze v kauzách") a `case_kind`.
//
//   npm run codelists:seed              # vypíše, čo by doplnil
//   npm run codelists:seed -- --apply   # zapíše cez store.js (s revíziou)
//
// Číselník nie je testovacie dáto, ale konfigurácia produktu — definície sa
// berú z `couch/fixtures/.../05-codelists.json`, aby existovali na jednom
// mieste. Fixtures ako celok sa na produkcii nespúšťajú nikdy; tento skript
// berie z toho súboru len uvedené druhy číselníkov.
//
// Idempotentný: položka sa hľadá podľa (kind, code) a existujúca sa nemení —
// moderátor ju mohol medzičasom upraviť (názov, poradie).

import { readFile } from "node:fs/promises";
import * as couch from "../couch.js";
import * as store from "../store.js";
import { config } from "../config.js";

const KINDS = ["phase", "case_kind"];
const SOURCE = new URL("../../../../couch/fixtures/dosledujto_register/05-codelists.json", import.meta.url);
const apply = process.argv.includes("--apply");

process.stdout.write(`databáza: ${config.COUCH_DB} na ${config.COUCH_URL.replace(/\/\/[^@]*@/, "//***@")}\n`);

const file = JSON.parse(await readFile(SOURCE, "utf8"));
const wanted = (Array.isArray(file) ? file : file.docs).filter((d) => KINDS.includes(d.kind));

const have = new Set();
for (const kind of KINDS) {
  const res = await couch.view("codelists", "by_kind", { startkey: [kind], endkey: [kind, {}], reduce: false });
  for (const row of res.rows) have.add(`${kind}:${row.value.code}`);
}

const missing = wanted.filter((d) => !have.has(`${d.kind}:${d.code}`));
if (missing.length === 0) {
  process.stdout.write("nič nechýba\n");
  process.exit(0);
}

for (const d of missing) {
  process.stdout.write(`${apply ? "dopĺňam" : "chýba"}: ${d.kind} ${d.code} — ${d.name}${d.bucket ? ` (bucket ${d.bucket})` : ""}\n`);
  if (!apply) continue;
  const { _id, _rev, type, created_at, updated_at, created_by, updated_by, ...data } = d;
  await store.createDoc({
    type: "codelist",
    data,
    actor: { id: "system:seed-codelists", role: "admin" },
    reason: "Číselníky fáz a druhov káuz (redizajn Červená niť)",
  });
}
if (!apply) process.stdout.write("spusti s --apply, aby sa zapísali\n");
process.exit(0);
