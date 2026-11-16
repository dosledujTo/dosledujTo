// Kontajner `pm2-api-admin`: REST API, ktoré zároveň servíruje admin SPA pod
// `/admin/*`.
//
// Admin nie je samostatný proces — je to statický build, ktorý Express
// servíruje z rovnakej domény. Práve preto zostáva session cookie first-party
// a nikde sa nekonfiguruje CORS.

module.exports = {
  apps: [
    {
      name: "api",
      script: "packages/api/src/server.js",
      cwd: "/app",

      // **Jedna inštancia zámerne.** Rate limiting beží v pamäti procesu
      // (`packages/api/src/middleware/ratelimit.js`) a session sa síce drží
      // v CouchDB, ale limity by pri viacerých inštanciách prestali byť
      // globálne — päť pokusov o prihlásenie by sa stalo piatimi na inštanciu.
      // Škálovať sa dá až vtedy, keď limity pôjdu do zdieľaného úložiska.
      instances: 1,
      exec_mode: "fork",

      // API pri štarte kontroluje CouchDB, Clouseau aj prítomnosť design
      // dokumentov a pri chybe skončí s kódom 1. Reštartovať donekonečna proti
      // nedostupnej databáze nemá zmysel, ale krátky výpadok databázy prežiť má.
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 2000,

      max_memory_restart: "512M",
      kill_timeout: 10000, // server.close() nechá dobehnúť rozpracované requesty

      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: process.env.NODE_ENV || "production",
        PORT: process.env.PORT || "3000",
      },
    },
  ],
};
