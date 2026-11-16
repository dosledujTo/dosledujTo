// `case.person_ids` and `case.party_ids` are denormalised so the search index
// can filter cases by person and by political party — Lucene cannot join
// (couch/README.md). They are derived state, and this is the only place that
// derives them: after a role changes, or after a link that could make somebody
// a party member changes.

import * as couch from "../../../shared/src/couch.js";
import * as store from "../../../shared/src/store.js";
import * as queries from "../../../shared/src/queries.js";

/**
 * Recompute the denormalised ids of one case.
 *
 * @param {string} caseId
 * @param {{ id: string, role: string }} actor
 */
export async function syncCaseEntities(caseId, actor) {
  const { roles } = await queries.caseChildren(caseId);
  const personIds = [...new Set(roles.map((r) => r.person_id).filter(Boolean))];

  const linkSets = await Promise.all(personIds.map((id) => queries.linksOf(id)));
  const orgIds = [
    ...new Set(
      linkSets
        .flat()
        // Party membership that ended does not make the case the party's.
        .filter((l) => l.doc.kind === "member" && !l.doc.valid_to)
        .map((l) => l.other_id)
        .filter((id) => id.startsWith("org:")),
    ),
  ];

  const orgs = await couch.getMany(orgIds);
  const partyIds = orgs.filter((o) => o.kind === "party").map((o) => o._id);

  // `updateDoc` is a no-op when nothing changed, so this writes neither a
  // document nor a revision on the common path.
  return store.updateDoc({
    id: caseId,
    patch: { person_ids: personIds, party_ids: partyIds },
    actor,
    reason: "prepočet väzieb kauzy",
  });
}

/**
 * A link changed: refresh every case the person appears in.
 *
 * @param {string} personId
 * @param {{ id: string, role: string }} actor
 */
export async function syncCasesOfPerson(personId, actor) {
  const rows = await queries.personCases(personId);
  const caseIds = [...new Set(rows.map((r) => r.case_id))];
  for (const caseId of caseIds) await syncCaseEntities(caseId, actor);
  return caseIds;
}
