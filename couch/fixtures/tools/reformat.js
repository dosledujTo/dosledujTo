// node couch/fixtures/tools/reformat.js <súbor.json>… — prepíše súbory formátom formatJson.
import { readFileSync, writeFileSync } from "node:fs";
import { formatJson } from "./format.js";

for (const file of process.argv.slice(2)) {
  writeFileSync(file, formatJson(JSON.parse(readFileSync(file, "utf8"))));
}
