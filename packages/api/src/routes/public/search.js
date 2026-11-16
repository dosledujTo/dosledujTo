import { Router } from "express";
import * as search from "../../../../shared/src/search.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { publicArticle } from "../../../../shared/src/projection.js";
import * as validate from "../../middleware/validate.js";

export const searchRoutes = Router();

// One index serves cases, people and organisations, so a search across all
// three is a single query (backend-zadanie.md §2.3). Articles live in their own
// index because they carry full text.
searchRoutes.get("/", validate.query(schemas.searchQuery), async (req, res) => {
  const { q, type, limit, cursor } = req.validQuery;

  if (type === "article") {
    const result = await search.searchArticles({
      q,
      limit,
      cursor,
      sort: "relevance",
      includeDocs: true,
    });
    return res.json({
      items: result.items.map(publicArticle),
      next_cursor: result.next_cursor,
      total: result.total,
    });
  }

  const result = await search.searchEntities({
    q,
    type,
    limit,
    cursor,
    sort: "relevance",
    counts: ["type"],
  });

  res.json({
    items: result.items,
    next_cursor: result.next_cursor,
    total: result.total,
    facets: result.counts,
  });
});
