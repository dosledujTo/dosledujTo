# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status of this repository

The database layer and the REST API exist and run. The worker exists **only as step 1**: a feed
reader that stores new articles as `candidate`. There is no article-text extraction, no matcher and
no notifier yet (`backend-zadanie.md` §8) — anything below describing those is specification, not
code. `packages/worker/README.md` records what step 1 does, what the four MVP feeds actually do in
practice, and what the next steps need.

**Written in plain JavaScript, not TypeScript** — the spec says TypeScript, the owner asked for JS.
Types live in JSDoc, so `tsc --checkJs` and editor tooling still work, with no build step. Do not
introduce TypeScript without asking.

| Path | What it is |
| --- | --- |
| `README.md` | Product specification (Slovak) — *Register káuz*, a public memory of Slovak public-affairs cases |
| `backend-zadanie.md` | Backend specification (Slovak) — stack, data model, indexes, API surface, worker |
| `projek_ai_zadanie.txt` | Original informal brief that the two specs elaborate |
| `couchman.md` | Vendored docs for `couchman`, the design-document deployment tool |
| `couch/` | Database layer — design documents, query-server helpers, fixtures. **Start at `couch/README.md`** |
| `packages/shared/` | Data layer: config, CouchDB access, the write path, search, schemas, sessions |
| `packages/api/` | Express 5 API, public and admin. **Start at `packages/api/README.md`** |
| `packages/worker/` | Crawler (step 1 only). **Start at `packages/worker/README.md`** |
| `packages/admin/` | Admin SPA — Vite + React + AdminLTE 4. **Start at `packages/admin/README.md`** |
| `packages/web/` | Public site — React + SSR, data via the REST API. **Start at `packages/web/README.md`** |
| `design_handoff_cervena_nit/` | Public-site redesign spec (Slovak) + clickable prototype `navrh.html` |
| `admin-zadanie.md` | Admin-zone specification (Slovak) — screens, roles, visual language |
| `docker/` | pm2 containers: one image, sources bind-mounted, profile-gated. **Start at `docker/README.md`** |
| `test/` | vitest + supertest, run against the live local CouchDB |

The specs are written in Slovak and that is deliberate: product content, UI and moderation vocabulary
are Slovak. Code identifiers, API routes (`/cases`, `/persons`, `/orgs`) and document field names are
English. Keep that split.

## Commands

Requires Node.js 22 LTS or newer. There is no build step — ESM runs as written.

```bash
npm run api                           # start the API on :3000, serves /admin too
npm run admin:build                   # build the admin SPA (Express 503s without it)
npm run web:build                     # build the public site (client + SSR bundles)
npm run admin:dev                     # Vite dev server on :5173, /api proxied to :3000
npm run worker:crawl -- --dry-run     # read the feeds, write nothing
npm test                              # vitest: unit + integration against the live CouchDB

npm run docker:build && npm run docker:up   # profiles app + workers; sources are bind-mounted,
                                      # so updating is git pull + npm run docker:reload
npm run couch:generate                # regenerate the deterministic fictional fixtures (7x-gen-*.json)
npm run couch:validate                # offline: parse, bundle, ES5 target check — safe to run anytime
npm run couch:plan                    # diff the couch/ tree against the database, writes nothing
npm run couch:push                    # apply the plan after confirmation
npm run couch:fixtures                # upsert the seed documents
npx couchman push --env=local --create-db --yes   # first deploy to a clean instance
npx couchman watch --env=local        # push on change, 300 ms debounce
npx couchman new view <db>/<ddoc>/<name>
```

The database is **`dosledujto_register`** — the `register` of `backend-zadanie.md` §2, prefixed
because the CouchDB instance may be shared with other projects. It could never have been
called `dosleduj.to`: CouchDB rejects a dot in a database name.

Development and tests need CouchDB 3.5 **with Clouseau reachable** at `COUCH_URL` (default
`127.0.0.1:5984`), so `_search` works — `ci/couch.compose.yaml` brings up exactly that. Verify before debugging a
search problem: `curl -X POST $COUCH/_search_analyze -H 'Content-Type: application/json' -d
'{"analyzer":"standard","text":"test"}'`. The API must check this at startup and fail loudly rather
than degrade to empty results (`backend-zadanie.md` §1).

CI is `.github/workflows/ci.yml` (check → test; `test` runs the full suite against a throwaway
CouchDB+Clouseau). There is no automatic deploy; `docker/deploy.sh` updates a server checkout by hand
and also warms and promotes a new `search_vN`. Committed `dist/` and generated fixtures must match
their sources — CI fails otherwise. Details in `docker/README.md`.

Exit codes: `0` no changes, `2` changes pending (use for `plan` in CI), `1` error.

### Working with design documents

- Design docs live as files under `couch/databases/<db>/<ddoc>/` (`views/`, `indexes/`, `filters/`,
  `updates/`, `validate_doc_update.js`, `meta.json`). Never edit them in Fauxton — the tree is the
  source of truth and `couchman` only manages documents carrying its `couchman.managed` marker.
- Query-server functions are transpiled to **ES5** (`target: "es5"` in the config). Write modern JS;
  SpiderMonkey gets something it can run. Do not raise the target.
- Shared helpers go in `_lib/` (one database) or `shared/` (all databases) and are imported as real
  ES modules; imports that reach outside the tree are a build error.
- Changing a search-index function or analyzer forces a **full Lucene rebuild**. Deploy under a new
  name (`--as=search_v2`), `warm`, then `promote` — see `couchman.md` §"Versioned deployment".
- `couchman.md` is the full reference; consult it before inventing conventions.

### What is deployed

Design documents: `search_v2` (Clouseau indexes `entities`, `articles`, `moderation`), `by_case`,
`by_person` (`cases`, `links`), `by_user` (`subscriptions`, `notifications`, `by_email`), `by_target`,
`by_article`, `by_date`, `proceedings`, `revisions` (`by_target`, `by_actor`), `slugs`, `stats`,
`codelists` (`by_kind`, `tag_usage`), and `rules` (`validate_doc_update`). Plus 85 hand-written
fixture documents and ~3 860 generated ones (`couch/fixtures/generate.js`, deterministic seed,
`npm run couch:generate`), all deliberately fictional. `couch/README.md` documents each one, what the
coverage view cannot compute, and why `case` carries denormalised `person_ids`/`party_ids`.

**Search is versioned.** The tree folder is `search_v2`; code always asks for the logical name
`search` and `couch.search()` resolves it through the `couchman:aliases` document (30 s cache). A
new index version is a new folder (`search_v3`): `couch:push`, `couchman warm --ddoc=search_v3`,
`couchman promote search_v3 search`, later `push --prune`. Until the prune, `couch:plan` reports one
pending deletion — expected. The prune asks for the ddoc name even with `--yes`, so non-interactively
it is `echo search | npx couchman push --env=local --prune --yes` (the name of the deleted ddoc),
followed by `POST /<db>/_search_cleanup` to drop the old Lucene files. A clean instance needs `couchman promote search_v2 search`
after the first push, or the API refuses to start and says so.

An instance that predates the redesign gets the phase/case_kind codelists from
`npm run codelists:seed -- --apply`, never from fixtures. A facet no document has yet (`kind_main` before the first case with a kind) is an error in
Clouseau; `search.query` retries without it and returns it empty — keep that.

`validate_doc_update` enforces the product's load-bearing rule at the database level: a document in
`publish_state: published` cannot carry a sourced field with an empty `sources` array. Any change to
the data model has to keep the fixtures passing it — `npm run couch:fixtures` is the check.

Test data is fictional on purpose (Testovací, Skúšobná, `*.example`): this product records criminal
status of real people, and a dev seed must not assert any. Keep it that way.

## Architecture

Node 22 + ESM (no TypeScript), Express 5, zod, pino, CouchDB **with Clouseau**, `nano` client.
`packages/worker` holds only the feed reader; the matcher and notifier are still specification.
`packages/admin` is a React SPA served by Express under `/admin/*` — same domain, so the session
cookie stays first-party and there is still no CORS anywhere. `packages/web` is the public site: **React with SSR**, mounted last so `/api` and `/admin` win.
It reads **only through the REST API** — on the server too, over localhost — so the API stays the
single contract and server and client cannot drift apart. Design comes from
`design_handoff_cervena_nit/` ("Červená niť", all seven milestones of its ch. 10 are done; the
older `design_handoff_dosleduj_redesign/` is superseded); fonts are self-hosted. Every tab and filter
has its own URL and renders server-side (`/osoba/:slug/{v-case,siet,zdroje}`, `/kauza/:slug/{prepojenia,zdroje}`,
`?strana=`, `?obdobie=`), so state lives in the URL, not the client — the exceptions are the theme
and the Sieť layout, which `d3-force` (the one extra web dependency) computes in the browser on top
of a server-rendered node list. Two load-bearing pieces in `shared`: `connections.js` (stable source
numbers `no` over an entity's whole unfiltered source list, used by both `/articles` and `/graph`;
graph steps are one `keys` query on `graph/edges`, never N+1) and `metrics.js` (the rules behind the
home-page money breakdown, "most written about" and "forgotten" — pure functions with tests, shown to
readers on `/ako-pocitame`).
`api` and `worker` deploy independently and **communicate only through the database** (worker writes
suggestions, reads `_changes`). No message queue in the MVP.

Crawling rules are not optional politeness: own User-Agent with a contact address, one request per
second per domain, `Retry-After` honoured, robots.txt checked for the feed *and* every link in it.
SME answers the default curl agent with a "Request Blocked" page at status **200**, so an unexpected
`content-type` is a feed error, not an empty feed. And **429/403 is the publisher's answer, not a
broken feed**: the host gets a cooldown (`feed.blocked_until`, doubling per repeat), the feed is
skipped until then and `consecutive_failures` does not grow. robots.txt is cached on the feed
document for 24 h, so a run makes one request per host, not two.

Official sources are constrained by robots.txt in ways that decide the architecture: InfoSúd
(`obcan.justice.sk/infosud`) and the ORSR company/person pages are **disallowed**; the open-data
catalogue `data.slovensko.sk` is `Allow: /`. Check `packages/worker/README.md` before proposing any
official-source integration — and `npm run worker:datasets -- "<term>" --check` before writing an
ingest, because catalogued distributions are frequently dead.

Dependencies live in the root `package.json` — no npm workspaces, Node resolves upward. There is one
`.env` for both packages.

Configuration treats an **empty environment variable as unset** (`loadConfig` filters `""` before
parsing). Docker Compose passes unset variables as empty strings, and without that filter
`COOKIE_SECURE=` would mean "false" even in production. Keep it that way when adding config.

Five load-bearing decisions that are easy to violate accidentally:

1. **Sourced value pattern.** Every publishable field is an object (`{ value, sources[], derived,
   derivation, disputed[], asserted_at }`), not a scalar. Empty `sources` means the value is not
   published — enforced at publish time. This is the whole product promise (README §4.6), not a detail.
2. **Automation proposes, humans confirm.** The worker may only create `suggestion` documents and
   `publish_state: draft` entities. It never writes to published documents.
3. **History is never overwritten.** A status change creates a *new* `role` document with `valid_from`
   and closes the old one with `valid_to` — an acquittal must be as visible as the charge.
4. **All writes go through `packages/shared/src/store.js`**, which also writes a `revision` (JSON
   Patch diff, actor, reason). Nothing else calls `couch.put`. CouchDB `_rev` is not an audit trail;
   compaction erases it. Exception, deliberate: `session`, `notification` and `subscription` writes
   are not audited — see `AUDITED` in `store.js`.
5. **Mango `_find` is not used.** Lists, filters and search go through Clouseau `_search` indexes;
   point reads by `_id`; relations and aggregates through map/reduce views. The client never sends a
   Lucene query — `lucene.js` composes it from whitelisted parameters and escapes free text.

`GET /api/cases/:id` fetches children via `by_case/children` in one query, never N+1.

The admin UI's load-bearing component is the sourced-value editor
(`packages/admin/src/sourced.jsx`): a field with no source is visibly broken the moment that state
arises, and publishing is blocked with the fields named. It has its own tests — if it stops
shouting, the product loses the one rule it stands on.

Forms reach for `packages/admin/src/pickers.jsx`, not for raw inputs: `EntityPicker` (typeahead over
persons/orgs/cases), `SourcesField` (sources as chips, added through the same search the sourced-value
editor uses) and `DeleteDialog`. An identifier typed by hand into a text field is a bug, not a
shortcut — `test/admin-pickers.test.jsx` keeps it that way.

Other constraints worth keeping in mind: dates indexed as epoch numbers (strings break range and
sort); diacritics need an explicitly stored normalized copy per field, since there is no Slovak
stemmer in Clouseau — the API folds query text with the *same* `couch/shared/normalize.js` the index
functions use, so the two cannot drift; amounts in cents as integers; article full text is stored but
**never returned by the public API** (only `excerpt`, title, publisher, date, link); sessions store a
*hash* of the token; first admin is created by hand, no API path can mint one.

**Deletion.** `store.deleteDoc` is the only path: it writes a revision *before* destroying the
document, and that revision carries `snapshot` — the whole document as it was. The `diff` alone is
useless here, because JSON Patch `remove` operations record no values, so without the snapshot the
audit would say that something vanished but not what. A deleted document cannot be reverted through
`/revisions/:id/revert` (that endpoint replays onto a document that still exists); the snapshot is
what makes recovery possible at all. Deleting a `role` also re-runs `syncCaseEntities`, or the case
would keep listing a person who no longer figures in it.

Deleting and closing are different acts and the UI must not merge them: a role whose status changed
is **ended** (`valid_to`, stays in history); a role that never belonged is deleted. Same for
publishing — `/hide` is a decision that a thing should not be public, `/unpublish` is a step back in
editorial work.

Two gotchas that cost time already: `nano` POSTs `_search` parameters as a JSON body, so `sort` and
`counts` must be arrays, not pre-stringified JSON. And `couch/README.md` plus `packages/api/README.md`
record the reasoning behind the non-obvious calls (why accepting a suggestion does not attach a
source, why revert replays the revision chain) — read them before changing that behaviour.

## Editorial rules that constrain the code

These come from README §6 and are product requirements, not styling preferences:

- Presumption of innocence is structural: `suspect | accused | indicted | convicted | acquitted` are
  distinct states and must be rendered distinctly.
- A datum without a source is not published, ever.
- Conflicting sources are both stored and both returned (`disputed`); the system does not adjudicate.
- Values the project derives itself (rather than quoting) must be flagged `derived: true` with the
  derivation described — that is the line between quoting someone else's claim and making our own.
