// Drží pm2-runtime otvorený v kontajneri, kde sú všetky ostatné úlohy cronové.
//
// Bez neho by pm2-runtime po dobehnutí poslednej úlohy zistil, že nemá čo
// dozerať, a ukončil by sa — kontajner by sa reštartoval v slučke a cron by sa
// nikdy nedostal k ďalšiemu behu.
//
// Nie je to strážca ani plánovač: nič nekontroluje a nič nespúšťa. Keď worker
// dostane vlastný plánovač, tento súbor zanikne.

const INTERVAL_MS = 60 * 60 * 1000;

function log(message) {
  process.stdout.write(`${new Date().toISOString()} heartbeat: ${message}\n`);
}

log("kontajner workerov beží, úlohy plánuje pm2 cez cron_restart");
setInterval(() => log("stále nažive"), INTERVAL_MS);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log(`dostal ${signal}, končím`);
    process.exit(0);
  });
}
