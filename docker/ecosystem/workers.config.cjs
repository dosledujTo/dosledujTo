// Kontajner `pm2-workers`: naplánované úlohy workera.
//
// Sem sa pridávajú ďalší workeri — jeden objekt v `apps` na jednu úlohu. Kým
// worker nemá vlastný plánovač, plánuje pm2 cez `cron_restart`.
//
// Ako to funguje: `autorestart: false` + `cron_restart` znamená „spusti podľa
// cronu, nechaj dobehnúť, nereštartuj". Proces je medzi behmi zastavený.
//
// Preto je tu `heartbeat`: **pm2-runtime sa ukončí, keď nemá ani jeden bežiaci
// proces**, takže kontajner by po prvom dobehnutí crawlera spadol. Heartbeat
// drží runtime otvorený. Zanikne, keď worker dostane vlastný plánovač
// (`node-cron`) a stane sa dlho bežiacim procesom.

const cron = (value, fallback) => value || fallback;

module.exports = {
  apps: [
    {
      name: "heartbeat",
      script: "docker/ecosystem/heartbeat.js",
      cwd: "/app",
      autorestart: true,
      merge_logs: true,
      time: true,
    },

    {
      name: "crawler",
      script: "packages/worker/src/bin/crawl.js",
      cwd: "/app",

      // Crawler je jednorazový príkaz: prečíta feedy, uloží nové články ako
      // `candidate` a skončí.
      autorestart: false,
      cron_restart: cron(process.env.CRAWL_CRON, "*/30 * * * *"),

      // Feedy sa čítajú podmieneným GET-om, takže častejší beh väčšinou vráti
      // 304 a nič nezapíše. SME ale vracia 429 pri opakovanom čítaní v priebehu
      // minúty — interval kratší než 30 minút mu nerob.
      args: [],

      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: process.env.NODE_ENV || "production",
      },
    },

    // Ďalšie kroky workera, keď budú existovať. Nechávam ich tu vypnuté, aby
    // bolo vidieť, kam patria — nie ako sľub, že už fungujú.
    //
    // {
    //   name: "matcher",
    //   script: "packages/worker/src/bin/match.js",
    //   autorestart: false,
    //   cron_restart: process.env.MATCH_CRON || "5,35 * * * *",
    // },
    // {
    //   name: "notifier",
    //   script: "packages/worker/src/bin/notify.js",
    //   autorestart: true, // číta _changes, beží trvalo
    // },
  ],
};
