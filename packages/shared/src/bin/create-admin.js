// Založenie prvého administrátora (backend-zadanie.md §7).
//
// Registrácia cez API vytvára **vždy** len `role: user` a žiadna cesta v API
// nevyrobí admina. Tento skript je zámerne mimo API: musí ho spustiť niekto,
// kto má prístup na server a k databáze.
//
//   npm run admin:create -- --email=ty@example.sk
//   npm run admin:create -- --email=ty@example.sk --role=moderator
//
// Heslo sa pýta interaktívne (bez vypisovania na obrazovku), aby neskončilo
// v histórii shellu. Dá sa poslať aj cez `ADMIN_PASSWORD`, ak to potrebuje
// skript.

import { createInterface } from "node:readline";
import * as couch from "../couch.js";
import * as store from "../store.js";
import { userByEmail } from "../queries.js";
import { hashPassword } from "../passwords.js";
import { config } from "../config.js";

const ROLES = ["user", "moderator", "admin", "superadmin"];

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (match) args[match[1]] = match[2] ?? "";
  }
  return args;
}

/**
 * Načíta heslo z terminálu bez vypisovania znakov.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function askPassword(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("heslo: nastav ADMIN_PASSWORD alebo spusti skript v termináli"));
      return;
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(prompt);

    // Vypnutie echa: readline ho samo nevie, takže sa prepíše výstup.
    const onData = (char) => {
      if (["\n", "\r", ""].includes(char.toString())) return;
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(prompt);
    };
    process.stdin.on("data", onData);

    rl.question("", (answer) => {
      process.stdin.off("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const args = parseArgs(process.argv.slice(2));
const email = (args.email ?? "").trim().toLowerCase();
const role = args.role ?? "admin";

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  process.stderr.write(
    "použitie: npm run admin:create -- --email=ty@example.sk [--role=admin|moderator|user]\n",
  );
  process.exit(2);
}
if (!ROLES.includes(role)) {
  process.stderr.write(`neznáma rola "${role}" (${ROLES.join(", ")})\n`);
  process.exit(2);
}

// Radšej to povedať nahlas: skript píše priamo do databázy, ktorú vidí.
process.stdout.write(`databáza: ${config.COUCH_DB} na ${config.COUCH_URL.replace(/\/\/[^@]*@/, "//***@")}\n`);

const exists = await couch.get("_design/rules").catch(() => null);
if (!exists) {
  process.stderr.write(
    "v databáze nie sú design dokumenty — najprv spusti `npm run couch:push`\n",
  );
  process.exit(1);
}

if (await userByEmail(email)) {
  process.stderr.write(`používateľ ${email} už existuje; rolu zmeň cez PATCH /api/admin/users/:id\n`);
  process.exit(1);
}

const password = process.env.ADMIN_PASSWORD ?? (await askPassword("heslo (min. 10 znakov): "));

// Minimum 10 znakov platí pri registrácii cez API, kde je na druhej strane
// anonym. Tu je na druhej strane človek s prístupom na server — ak si zvolí
// kratšie, je to jeho rozhodnutie, ale musí ho vysloviť.
if (password.length < 10 && args["allow-short-password"] === undefined) {
  process.stderr.write(
    `heslo má ${password.length} znakov, minimum je 10.\n` +
      "Ak to má byť naozaj takto, pridaj --allow-short-password\n",
  );
  process.exit(1);
}
if (password.length < 10) {
  process.stderr.write(
    `\nUPOZORNENIE: heslo má ${password.length} znakov. Tento účet bude mať ` +
      "prístup do administrácie na verejnej doméne.\n",
  );
}

const user = await store.createDoc({
  type: "user",
  data: {
    email,
    password_hash: await hashPassword(password),
    display_name: args["display-name"] ?? null,
    role,
    status: "active",
    email_verified_at: null,
    last_login_at: null,
    notification_prefs: { frequency: "daily", level: "significant" },
  },
  // V audite je vidieť, že účet nevznikol registráciou, ale ručne na serveri.
  actor: { id: "system:create-admin", role: "admin" },
  reason: `ručné založenie účtu s rolou ${role}`,
});

process.stdout.write(`\nhotovo: ${user._id}\n  ${email} · ${role}\n`);
process.stdout.write("prihlás sa v administrácii; ďalšie roly už prideľuj cez /api/admin/users/:id\n");
