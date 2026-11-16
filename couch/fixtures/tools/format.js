// JSON vo fixtures v štýle repozitára: dve medzery, krátke polia jednoduchých
// hodnôt na jednom riadku. Bez toho by každá úprava fixtures prepísala aj
// formátovanie a diff by bol nečitateľný.

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatJson(value) {
  const text = JSON.stringify(value, null, 2);
  // Pole, ktoré obsahuje len reťazce, čísla, true/false/null — zložiť na jeden riadok.
  return (
    text.replace(/\[\n(\s*)((?:"(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|true|false|null)(?:,\n\s*(?:"(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|true|false|null))*)\n\s*\]/g,
      (match, _indent, body, offset) => {
        const lineStart = text.lastIndexOf("\n", offset) + 1;
        const one = "[" + body.split(/,\n\s*/).join(", ") + "]";
        return offset - lineStart + one.length <= 100 ? one : match;
      }) + "\n"
  );
}
