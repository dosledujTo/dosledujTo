// Prehľadávanie Národného katalógu otvorených dát a overenie, či sa dá dataset
// naozaj stiahnuť.
//
//   npm run worker:datasets -- "sudne pojednavania"
//   npm run worker:datasets -- "pojednáv" --check
//
// Slúži na rozhodnutie „ide sa z tohto zdroja dať čítať?" pred tým, než sa
// napíše ingest. Odpoveď „dataset v katalógu je, ale súbor je mŕtvy" je
// legitímny a dôležitý výsledok.

import { searchDatasets, distributionsOf, checkDistribution } from "../lib/opendata.js";

const args = process.argv.slice(2);
const check = args.includes("--check");
const query = args.filter((a) => !a.startsWith("--")).join(" ");

if (!query) {
  process.stderr.write('použitie: npm run worker:datasets -- "hľadaný výraz" [--check]\n');
  process.exit(2);
}

const datasets = await searchDatasets(query, { limit: 20 });
if (datasets.length === 0) {
  process.stdout.write(`žiadny dataset s „${query}“ v názve\n`);
  process.exit(0);
}

let alive = 0;
let dead = 0;

for (const dataset of datasets) {
  process.stdout.write(`\n${dataset.title.trim()}\n  ${dataset.uri}\n`);

  const distributions = await distributionsOf(dataset.uri);
  for (const dist of distributions) {
    const url = dist.downloadUrl ?? dist.accessUrl;
    const label = `${dist.format ?? dist.mediaType ?? "?"}`.padEnd(12);
    if (!url) continue;

    if (!check) {
      process.stdout.write(`    ${label} ${url}\n`);
      continue;
    }

    const status = await checkDistribution(url);
    status.alive ? alive++ : dead++;
    const mark = status.alive ? "OK  " : "MŔTVE";
    const detail = status.alive
      ? `${status.status} ${status.contentType ?? ""} ${status.bytes ?? 0}B`
      : status.error ?? `HTTP ${status.status}`;
    process.stdout.write(`    ${mark} ${label} ${url}\n           ${detail}\n`);
  }
}

if (check) process.stdout.write(`\nspolu: ${alive} dostupných, ${dead} nedostupných distribúcií\n`);
