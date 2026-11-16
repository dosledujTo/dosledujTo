// Server state cez TanStack Query. Žiadny ďalší state-management: čo je na
// serveri, patrí sem; čo je v rozpracovanom formulári, patrí do komponentu.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, patch, post } from "./client.js";

export const keys = {
  profile: ["profile"],
  summary: ["admin", "summary"],
  cases: (params) => ["admin", "cases", params],
  case: (id) => ["admin", "case", id],
  persons: (params) => ["admin", "persons", params],
  person: (id) => ["admin", "person", id],
  orgs: (params) => ["admin", "orgs", params],
  org: (id) => ["admin", "org", id],
  articles: (params) => ["admin", "articles", params],
  article: (id) => ["admin", "article", id],
  suggestions: (params) => ["admin", "suggestions", params],
  suggestion: (id) => ["admin", "suggestion", id],
  revisions: (params) => ["admin", "revisions", params],
  users: (params) => ["admin", "users", params],
  feeds: ["admin", "feeds"],
  search: (q) => ["admin", "search", q],
  proceedings: (params) => ["admin", "proceedings", params],
  codelists: (params) => ["admin", "codelists", params],
  proceeding: (id) => ["admin", "proceeding", id],
};

export const useProfile = () =>
  useQuery({ queryKey: keys.profile, queryFn: () => get("/profile"), retry: false });

export const useSummary = () =>
  useQuery({ queryKey: keys.summary, queryFn: () => get("/admin/summary"), refetchInterval: 60_000 });

export const useCases = (params) =>
  useQuery({ queryKey: keys.cases(params), queryFn: () => get("/admin/cases", params) });

export const useCase = (id) =>
  useQuery({ queryKey: keys.case(id), queryFn: () => get(`/admin/cases/${id}`), enabled: !!id });

export const usePersons = (params) =>
  useQuery({ queryKey: keys.persons(params), queryFn: () => get("/admin/persons", params) });

export const usePerson = (id) =>
  useQuery({ queryKey: keys.person(id), queryFn: () => get(`/admin/persons/${id}`), enabled: !!id });

export const useOrgs = (params) =>
  useQuery({ queryKey: keys.orgs(params), queryFn: () => get("/admin/orgs", params) });

export const useOrg = (id) =>
  useQuery({ queryKey: keys.org(id), queryFn: () => get(`/admin/orgs/${id}`), enabled: !!id });

export const useUser = (id) =>
  useQuery({ queryKey: ["admin", "user", id], queryFn: () => get(`/admin/users/${id}`), enabled: !!id });

export const useArticles = (params) =>
  useQuery({ queryKey: keys.articles(params), queryFn: () => get("/admin/articles", params) });

export const useArticle = (id) =>
  useQuery({ queryKey: keys.article(id), queryFn: () => get(`/admin/articles/${id}`), enabled: !!id });

export const useSuggestions = (params) =>
  useQuery({ queryKey: keys.suggestions(params), queryFn: () => get("/admin/suggestions", params) });

export const useSuggestion = (id) =>
  useQuery({
    queryKey: keys.suggestion(id),
    queryFn: () => get(`/admin/suggestions/${id}`),
    enabled: !!id,
  });

export const useRevisions = (params) =>
  useQuery({
    queryKey: keys.revisions(params),
    queryFn: () => get("/admin/revisions", params),
    enabled: !!(params?.target_id || params?.actor_id),
  });

export const useUsers = (params) =>
  useQuery({ queryKey: keys.users(params), queryFn: () => get("/admin/users", params) });

export const useFeeds = () =>
  useQuery({ queryKey: keys.feeds, queryFn: () => get("/admin/feeds") });

export const useProceedings = (params) =>
  useQuery({
    queryKey: keys.proceedings(params),
    queryFn: ({ signal }) => get("/admin/proceedings", params, signal),
    placeholderData: (previous) => previous,
  });

export const useProceeding = (id) =>
  useQuery({ queryKey: keys.proceeding(id), queryFn: () => get(`/admin/proceedings/${id}`), enabled: !!id });

export const useGlobalSearch = (q) =>
  useQuery({
    queryKey: keys.search(q),
    queryFn: () => get("/admin/search", { q, limit: 8 }),
    enabled: (q ?? "").trim().length >= 2,
  });

/**
 * Mutácia, ktorá po úspechu zneplatní dotknuté dotazy. Zneplatňuje sa vždy aj
 * `summary` — badge v sidebare ukazujú prácu, ktorá čaká, a po jej vybavení
 * musia klesnúť samy.
 *
 * @param {(input: any) => Promise<any>} fn
 * @param {(input: any) => Array<Array<unknown>>} [invalidate]
 */
export function useAdminMutation(fn, invalidate = () => []) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, input) => {
      for (const key of [...invalidate(input), keys.summary]) {
        client.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export const usePatchCase = (id) =>
  useAdminMutation(
    ({ patch: body, reason, rev }) => patch(`/admin/cases/${id}`, { patch: body, reason, rev }),
    () => [keys.case(id), ["admin", "cases"], ["admin", "revisions"]],
  );

export const usePublishCase = (id) =>
  useAdminMutation(
    (body) => post(`/admin/cases/${id}/publish`, body ?? {}),
    () => [keys.case(id), ["admin", "cases"]],
  );

export const useHideCase = (id) =>
  useAdminMutation(
    (body) => post(`/admin/cases/${id}/hide`, body),
    () => [keys.case(id), ["admin", "cases"]],
  );

export const useAddEvent = (id) =>
  useAdminMutation((body) => post(`/admin/cases/${id}/events`, body), () => [keys.case(id)]);

export const useAddRole = (id) =>
  useAdminMutation((body) => post(`/admin/cases/${id}/roles`, body), () => [keys.case(id)]);

export const useAddProceeding = (id) =>
  useAdminMutation((body) => post(`/admin/cases/${id}/proceedings`, body), () => [keys.case(id)]);

export const useCreateCase = () =>
  useAdminMutation((body) => post("/admin/cases", body), () => [["admin", "cases"]]);

export const usePatchArticle = (id) =>
  useAdminMutation(
    (body) => patch(`/admin/articles/${id}`, body),
    () => [keys.article(id), ["admin", "articles"]],
  );

export const useCreateArticle = () =>
  useAdminMutation((body) => post("/admin/articles", body), () => [["admin", "articles"]]);

export const useAcceptSuggestion = (id) =>
  useAdminMutation(
    (body) => post(`/admin/suggestions/${id}/accept`, body ?? {}),
    () => [keys.suggestion(id), ["admin", "suggestions"], ["admin", "case"]],
  );

export const useRejectSuggestion = (id) =>
  useAdminMutation(
    (body) => post(`/admin/suggestions/${id}/reject`, body),
    () => [keys.suggestion(id), ["admin", "suggestions"]],
  );

export const useRunFeed = () =>
  useAdminMutation((id) => post(`/admin/feeds/${id}/run`, {}), () => [keys.feeds]);

export const useAddModerator = (caseId) =>
  useAdminMutation(
    (body) => post(`/admin/cases/${caseId}/moderators`, body),
    () => [keys.case(caseId), ["admin", "cases"]],
  );

export const useRemoveModerator = (caseId) =>
  useAdminMutation(
    (userId) => del(`/admin/cases/${caseId}/moderators/${userId}`),
    () => [keys.case(caseId), ["admin", "cases"]],
  );

// Potomkovia kauzy. Zneplatňuje sa detail kauzy aj samostatný zoznam konaní —
// tá istá vec je vidieť na dvoch miestach a nesmie sa rozísť.
const childKeys = (caseId) => [
  ["admin", "case", caseId], ["admin", "proceedings"], ["admin", "revisions"],
];

export const usePatchEvent = (caseId) =>
  useAdminMutation(({ id, ...body }) => patch(`/admin/events/${id}`, body), () => childKeys(caseId));

export const useDeleteEvent = (caseId) =>
  useAdminMutation(({ id, reason }) => del(`/admin/events/${id}`, { reason }), () => childKeys(caseId));

export const usePatchProceeding = (caseId) =>
  useAdminMutation(
    ({ id, ...body }) => patch(`/admin/proceedings/${id}`, body),
    ({ id }) => [...childKeys(caseId), keys.proceeding(id)],
  );

export const useDeleteProceeding = (caseId) =>
  useAdminMutation(({ id, reason }) => del(`/admin/proceedings/${id}`, { reason }), () => childKeys(caseId));

export const usePatchRole = (caseId) =>
  useAdminMutation(({ id, ...body }) => patch(`/admin/roles/${id}`, body), () => childKeys(caseId));

export const useDeleteRole = (caseId) =>
  useAdminMutation(({ id, reason }) => del(`/admin/roles/${id}`, { reason }), () => childKeys(caseId));

/** Ukončenie role — bežná cesta pri zmene statusu; rola zostáva v histórii. */
export const useEndRole = (caseId) =>
  useAdminMutation(({ id, ...body }) => post(`/admin/roles/${id}/end`, body), () => childKeys(caseId));

export const useUnpublishCase = (id) =>
  useAdminMutation(
    (body) => post(`/admin/cases/${id}/unpublish`, body),
    () => [keys.case(id), ["admin", "cases"]],
  );

export const usePatchPerson = (id) =>
  useAdminMutation(
    ({ patch: body, reason, rev }) => patch(`/admin/persons/${id}`, { patch: body, reason, rev }),
    () => [keys.person(id), ["admin", "persons"], ["admin", "revisions"]],
  );

export const usePublishPerson = (id) =>
  useAdminMutation(
    (body) => post(`/admin/persons/${id}/publish`, body ?? {}),
    () => [keys.person(id), ["admin", "persons"]],
  );

export const useUnpublishPerson = (id) =>
  useAdminMutation(
    (body) => post(`/admin/persons/${id}/unpublish`, body),
    () => [keys.person(id), ["admin", "persons"]],
  );

/**
 * Pripojenie a odpojenie zdroja od kauzy.
 *
 * Väzba je uložená na článku (`case_ids`), takže sa musí najprv načítať, čo tam
 * už je — inak by pripojenie jedného zdroja odpojilo všetky ostatné kauzy.
 */
export const useAttachSource = (caseId) =>
  useAdminMutation(
    async ({ id, reason }) => {
      const { article } = await get(`/admin/articles/${id}`);
      const caseIds = article.case_ids ?? [];
      if (caseIds.includes(caseId)) return article;
      return patch(`/admin/articles/${id}`, {
        case_ids: [...caseIds, caseId],
        reason: reason ?? "pripojenie zdroja ku kauze",
      });
    },
    () => [["admin", "articles"], ["admin", "case", caseId]],
  );

export const useDetachSource = (caseId) =>
  useAdminMutation(
    async ({ id, reason }) => {
      const { article } = await get(`/admin/articles/${id}`);
      return patch(`/admin/articles/${id}`, {
        case_ids: (article.case_ids ?? []).filter((value) => value !== caseId),
        reason: reason ?? "odpojenie zdroja od kauzy",
      });
    },
    () => [["admin", "articles"], ["admin", "case", caseId]],
  );

export const usePatchUser = (id) =>
  useAdminMutation(
    (body) => patch(`/admin/users/${id}`, body),
    () => [["admin", "users"], ["admin", "user", id], ["admin", "revisions"]],
  );


// ── Číselníky ─────────────────────────────────────────────────────────────────

/**
 * Číselník číta každý, kto vypĺňa formulár — ponuka súdov v konaní aj tagov pri
 * kauze pochádza odtiaľto. Mení ho len admin.
 */
export const useCodelists = (params = {}) =>
  useQuery({
    queryKey: keys.codelists(params),
    queryFn: () => get("/admin/codelists", params),
    staleTime: 5 * 60_000,
  });

export const useCreateCodelistItem = () =>
  useAdminMutation((body) => post("/admin/codelists", body), () => [["admin", "codelists"]]);

export const usePatchCodelistItem = () =>
  useAdminMutation(
    ({ id, ...body }) => patch(`/admin/codelists/${id}`, body),
    () => [["admin", "codelists"], ["admin", "revisions"]],
  );


// ── Väzby medzi záznamami ─────────────────────────────────────────────────────
//
// Tá istá väzba je vidieť na viacerých obrazovkách naraz — článok na detaile
// kauzy aj na profile osoby, konanie v sekcii Konania aj na profile subjektu.
// Po zápise sa preto zneplatňuje celá skupina, nie jeden kľúč: rozídené
// obrazovky sú horšie než jeden dotaz navyše.
const relationKeys = () => [
  ["admin", "case"], ["admin", "cases"], ["admin", "person"], ["admin", "persons"],
  ["admin", "org"], ["admin", "orgs"], ["admin", "article"], ["admin", "articles"],
  ["admin", "proceeding"], ["admin", "proceedings"], ["admin", "revisions"],
];

const CREATE_PATHS = { case: "cases", person: "persons", org: "orgs" };

/** Založenie kauzy, osoby alebo subjektu priamo z našepkávača. */
export const useCreateEntity = (kind) =>
  useAdminMutation((body) => post(`/admin/${CREATE_PATHS[kind]}`, body), relationKeys);

export const useCreatePerson = () => useCreateEntity("person");
export const useCreateOrg = () => useCreateEntity("org");

/**
 * Rola v kauze, zakladaná odinakiaľ než z detailu kauzy — z profilu osoby,
 * subjektu alebo priamo z článku, ktorý je jej zdrojom.
 */
export const useAddRoleAnywhere = () =>
  useAdminMutation(({ case_id, ...body }) => post(`/admin/cases/${case_id}/roles`, body), relationKeys);

export const useCreateLink = () =>
  useAdminMutation((body) => post("/admin/links", body), relationKeys);

export const usePatchLink = () =>
  useAdminMutation(({ id, ...body }) => patch(`/admin/links/${id}`, body), relationKeys);

export const useDeleteLink = () =>
  useAdminMutation(({ id, reason }) => del(`/admin/links/${id}`, { reason }), relationKeys);

/**
 * Pripojenie a odpojenie článku. Väzba je uložená **na článku**
 * (`case_ids`, `person_ids`, `org_ids`), takže sa musí najprv načítať, čo tam
 * už je — inak by pripojenie jednej väzby zmazalo všetky ostatné.
 */
export const useLinkArticle = () =>
  useAdminMutation(async ({ articleId, field, add, remove, reason }) => {
    const { article } = await get(`/admin/articles/${articleId}`);
    const current = article[field] ?? [];
    const next = add ? [...new Set([...current, add])] : current.filter((value) => value !== remove);
    return patch(`/admin/articles/${articleId}`, { [field]: next, reason });
  }, relationKeys);

/** To isté pre konanie: `sources`, `person_ids`, `org_ids` sú polia na konaní. */
export const useLinkProceeding = () =>
  useAdminMutation(async ({ proceedingId, field, add, remove, reason }) => {
    const { proceeding } = await get(`/admin/proceedings/${proceedingId}`);
    const current = proceeding[field] ?? [];
    const next = add ? [...new Set([...current, add])] : current.filter((value) => value !== remove);
    return patch(`/admin/proceedings/${proceedingId}`, { [field]: next, reason });
  }, relationKeys);
