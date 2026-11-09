import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/crm-data") {
      return nextResolve(new URL("../lib/crm-data.ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  EMPTY_COLUMN_FILTER, columnValue, getColumnOptions,
  isColumnFilterActive, matchesColumnFilters,
} = await import("../lib/lead-column-filters.ts");
const filter = overrides => ({ ...EMPTY_COLUMN_FILTER, ...overrides });
const rows = Array.from({ length: 250 }, (_, index) => ({
  id: String(index + 1),
  ownerName: index === 249 ? "Último Propietario" : "Ana García",
  address: `Calle Mayor ${index + 1}`,
  distrito: index % 2 ? "Centro" : "Retiro",
  fechaNoticia: index === 249 ? "2026-11-09" : "2026-01-15",
  month: index === 249 ? "2026-11" : "2026-01",
  dominio: index % 2 ? "Chamartín" : "—",
  phase: "identificada",
  status: "activa",
  source: index % 2 ? "Idealista" : "Sin origen",
  owner: "Usuario",
  valor: "50.000 €",
  enVenta: "SI",
  isFavorite: index === 249,
}));

assert.equal(rows.filter(row => matchesColumnFilters(row, {
  ownerName: filter({ text: "  ÚLTIMO  " }),
})).length, 1, "Text filter includes matches beyond the first two pages");
assert.equal(rows.filter(row => matchesColumnFilters(row, {
  distrito: filter({ values: ["Centro", "Retiro"] }),
})).length, 250, "Selections within one column use OR");
assert.equal(rows.filter(row => matchesColumnFilters(row, {
  distrito: filter({ values: ["Centro"] }),
  ownerName: filter({ text: "último" }),
})).length, 1, "Different column filters use AND");
assert.equal(matchesColumnFilters(rows[0], {
  address: filter({ text: "mayor", values: ["Calle Mayor 1"] }),
}), true, "Text and selected values combine within a column");
assert.equal(matchesColumnFilters(rows[0], {
  address: filter({ text: "otra", values: ["Calle Mayor 1"] }),
}), false);
assert.equal(matchesColumnFilters(rows[249], {
  fechaNoticia: filter({ exact: "2026-11-09" }),
}), true);
assert.equal(matchesColumnFilters(rows[249], {
  fechaNoticia: filter({ from: "2026-11-01", to: "2026-11-08" }),
}), false);
assert.equal(matchesColumnFilters(rows[249], {
  fechaNoticia: filter({ from: "2026-11-09", to: "2026-11-09" }),
}), true, "Date endpoints are inclusive");
assert.equal(matchesColumnFilters({ ...rows[0], fechaNoticia: "" }, {
  fechaNoticia: filter({ to: "2026-11-09" }),
}), false);
assert.equal(matchesColumnFilters(rows[0], {
  dominio: filter({ values: [""] }), source: filter({ values: [""] }),
}), true, "Placeholder categories represent Sin valor");
assert.equal(columnValue({ ...rows[0], columnFilterValues: { phase: "", status: "" } }, "phase"), "");
assert.equal(columnValue(rows[0], "phase"), "Identificada");
assert.equal(columnValue(rows[0], "status"), "Activa");
assert.equal(matchesColumnFilters(rows[0], { id: filter({ text: "000001" }) }), true);
const options = getColumnOptions(rows);
assert.deepEqual(options.distrito, ["Centro", "Retiro"]);
assert.ok(options.source.includes(""));
assert.ok(options.ownerName.includes("Último Propietario"));
assert.deepEqual(getColumnOptions([]).ownerName, []);
assert.equal(isColumnFilterActive(filter({ text: "  " })), false);
assert.equal(isColumnFilterActive(filter({ values: [""] })), true);
assert.equal(rows.filter(row => row.isFavorite && row.dominio === "Chamartín" &&
  row.phase === "identificada" && row.status === "activa" &&
  row.fechaNoticia >= "2026-11-01" && row.ownerName.toLowerCase().includes("último") &&
  matchesColumnFilters(row, { distrito: filter({ values: ["Centro"] }) })).length, 1,
"Column filters compose with favorites, domain, phase, status, date and global text");
assert.equal(rows.filter(row => matchesColumnFilters(row, {})).length, 250, "Clearing restores the dataset");
console.log("PASS: text normalization, multi-select OR, cross-column AND, dates, empty values, full-dataset options, and combined filters.");
