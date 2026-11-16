// Jednorazový beh crawlera z príkazového riadka.
//
//   npm run worker:crawl -- --dry-run
//   npm run worker:crawl -- --feed=feed:0192… --limit=5
//
// Plánovač (node-cron) príde s krokom, v ktorom bude worker bežať trvalo. Kým
// je to jednorazový príkaz, dá sa spustiť aj z `POST /api/admin/feeds/:id/run`
// — API a worker sa rozprávajú cez databázu, nie priamo.

import { crawlAll } from "../crawl.js";
import { checkConnection } from "../../../shared/src/couch.js";
import { logger } from "../../../shared/src/logger.js";

function parseArgs(argv) {
  const args = { dryRun: false, includeDisabled: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--include-disabled") args.includeDisabled = true;
    else if (arg.startsWith("--feed=")) args.feedId = arg.slice(7);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice(8));
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

try {
  await checkConnection();
} catch (err) {
  logger.fatal({ err: err.message }, "crawler sa nespustil");
  process.exit(1);
}

const results = await crawlAll(args);

const total = results.reduce(
  (sum, r) => ({
    created: sum.created + r.created,
    duplicate: sum.duplicate + r.duplicate,
    rejected: sum.rejected + r.rejected,
    errors: sum.errors + (r.status === "error" ? 1 : 0),
    blocked: sum.blocked + (r.status === "blocked" ? 1 : 0),
  }),
  { created: 0, duplicate: 0, rejected: 0, errors: 0, blocked: 0 },
);

for (const r of results) {
  process.stdout.write(
    `${r.feed.padEnd(14)} ${r.status.padEnd(13)} ` +
      `nájdených ${String(r.found).padStart(3)}  nových ${String(r.created).padStart(3)}  ` +
      `duplicít ${String(r.duplicate).padStart(3)}  odmietnutých ${r.rejected}` +
      (r.error ? `  — ${r.error}` : "") +
      "\n",
  );
}
process.stdout.write(
  `\nspolu: ${total.created} nových článkov, ${total.duplicate} už evidovaných, ` +
    `${total.rejected} odmietnutých, ${total.errors} chybných feedov` +
    (total.blocked ? `, ${total.blocked} odmietnutých médiom` : "") +
    (args.dryRun ? " (dry-run, nič sa nezapísalo)" : "") +
    "\n",
);

// Chybný feed nie je dôvod na nenulový návratový kód: pri štyroch médiách je
// bežné, že jedno práve nemá náladu. Za zlyhanie sa počíta, keď zlyhali všetky.
process.exit(results.length > 0 && total.errors === results.length ? 1 : 0);
