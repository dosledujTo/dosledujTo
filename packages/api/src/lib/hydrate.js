// Hydratácia žije v `shared`, lebo ju potrebuje aj verejný web. Tento súbor
// zostáva ako cesta, na ktorú sa odkazujú routy.
export { collectSourceIds, sourceMap, nameMap, epoch } from "../../../shared/src/hydrate.js";
