// Sourcing coverage — the product's own quality metric (produktové zadanie §9:
// "podiel údajov s funkčným odkazom na zdroj, cieľ 100 %").
//
//   ?group_level=1              per document type
//   ?group_level=2              split by publish_state (entities) / kind (articles)
//
// Value slots, summed by the builtin `_sum`:
//
//   [0] documents
//   [1] sourced fields present
//   [2] … of which have at least one source
//   [3] … of which are our own derivation, not a quote (zadanie §5.10)
//   [4] … of which carry a disputed alternative
//
// What this view cannot tell you: how many fields rest on an *official* source
// rather than a media article. The kind lives on the `article` document and a
// map function sees one document at a time. That ratio has to be computed in
// the API by resolving the source ids — see couch/README.md.

export default function (doc) {
  var type = doc.type;
  if (!type) return;

  if (type === "article") {
    emit([type, doc.kind || "media"], [1, 0, 0, 0, 0]);
    return;
  }

  var counted = 0;
  var sourced = 0;
  var derived = 0;
  var disputed = 0;

  // Direct sourced fields on the document (`summary`, `status`, `amount`, …).
  for (var key in doc) {
    if (!Object.prototype.hasOwnProperty.call(doc, key)) continue;
    if (key.charAt(0) === "_") continue;
    var field = doc[key];
    if (!field || typeof field !== "object") continue;
    if (Object.prototype.toString.call(field.sources) !== "[object Array]") continue;

    counted++;
    if (field.sources.length > 0) sourced++;
    if (field.derived) derived++;
    if (field.disputed && field.disputed.length > 0) disputed++;
  }

  // `role`, `link`, `event` and `proceeding` carry their sources at the root:
  // the whole document is one sourced assertion.
  if (type === "role" || type === "link" || type === "event" || type === "proceeding") {
    counted++;
    if ((doc.sources || []).length > 0) sourced++;
    if (doc.derived) derived++;
  }

  var bucket = doc.publish_state || "n/a";
  emit([type, bucket], [1, counted, sourced, derived, disputed]);
}
