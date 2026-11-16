// Kontroly vzťahov medzi dokumentmi, ktoré `validate_doc_update` nevie urobiť
// (nečíta iné dokumenty).

import * as couch from "../../../shared/src/couch.js";
import { badRequest, notFound } from "../../../shared/src/index.js";

/**
 * Konanie, ku ktorému sa udalosť viaže, musí patriť tej istej kauze — inak by
 * kalendár ukázal pojednávanie pod súdom inej veci.
 *
 * @param {string|null|undefined} proceedingId
 * @param {string} caseId
 */
export async function checkEventProceeding(proceedingId, caseId) {
  if (!proceedingId) return;
  const proceeding = await couch.get(proceedingId);
  if (!proceeding || proceeding.type !== "proceeding") throw notFound("konanie");
  if (proceeding.case_id !== caseId) throw badRequest("konanie patrí inej kauze");
}
