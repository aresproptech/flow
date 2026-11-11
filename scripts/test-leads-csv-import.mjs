import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/crm-data") {
      return nextResolve(new URL("../lib/crm-data.ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { parseCsvText } = await import("../lib/csv.ts");
const {
  buildLeadFromMapped,
  mapCsvRowsToOpportunityLoader,
  mapOpportunityLoaderRowsToTargets,
  suggestMapping,
  validateMappedRow,
} = await import("../lib/leads-csv-import.ts");

function preview(rows, headers, mapping = suggestMapping(headers)) {
  const staged = mapCsvRowsToOpportunityLoader(rows);
  return {
    staged,
    mapped: mapOpportunityLoaderRowsToTargets(staged.rows, headers, mapping),
  };
}

for (const [nameHeader, phoneHeader] of [
  ["Nombre completo", "Teléfono oficina"],
  ["Contacto principal", "Teléfono oficina contacto"],
  [" NOMBRE COMPLETO ", " TELÉFONO OFICINA "],
  ["nombre_completo", "telefono_oficina"],
]) {
  const headers = [nameHeader, phoneHeader];
  const rows = [{ [nameHeader]: "Contacto de prueba", [phoneHeader]: "+34 910000000" }];
  const mapping = { ownerName: nameHeader, phone: phoneHeader };
  const { staged, mapped } = preview(rows, headers, mapping);
  assert.equal(staged.matchedColumns, 2);
  assert.deepEqual(staged.rows, [{
    contacto_principal: "Contacto de prueba",
    telefono_oficina_contacto: "+34 910000000",
  }]);
  assert.deepEqual(mapped, [{ ownerName: "Contacto de prueba", phone: "+34 910000000" }]);
  assert.equal(validateMappedRow(mapped[0]).valid, true);
}

assert.deepEqual(suggestMapping(["Nombre completo", "Teléfono oficina"]), {
  ownerName: "Nombre completo",
  phone: "Teléfono oficina",
});
assert.deepEqual(suggestMapping(["Contacto principal", "Teléfono oficina contacto"]), {
  ownerName: "Contacto principal",
  phone: "Teléfono oficina contacto",
});
assert.equal(suggestMapping(["Nombre completo", "Contacto principal"]).ownerName, "Contacto principal");
assert.equal(suggestMapping(["Teléfono oficina", "Teléfono celular"]).phone, "Teléfono oficina");

const originalRow = {
  ID: "123",
  "E-mail priv contacto": "test@example.invalid",
  Domicilio: "Calle de prueba",
  "Código Postal": "28001",
  Presupuesto: "100000",
  "Columna desconocida": "ignorar",
  created_at: "ignorar",
  created_by: "ignorar",
};
assert.deepEqual(mapCsvRowsToOpportunityLoader([originalRow]), {
  matchedColumns: 5,
  rows: [{
    id_external: "123",
    email_priv_contacto: "test@example.invalid",
    domicilio: "Calle de prueba",
    codigo_postal: "28001",
    presupuesto: "100000",
  }],
});

const partialRows = [
  { "Nombre completo": "Solo nombre", "Teléfono oficina": "" },
  { "Nombre completo": "", "Teléfono oficina": "910000000" },
  { "Nombre completo": " ", "Teléfono oficina": " " },
];
assert.deepEqual(
  preview(partialRows, Object.keys(partialRows[0])).mapped.map(row => validateMappedRow(row).valid),
  [true, true, false],
);

const fixturePath = process.argv[2];
if (fixturePath) {
  const parsed = parseCsvText(readFileSync(fixturePath, "utf8"));
  const mapping = suggestMapping(parsed.headers);
  assert.equal(mapping.ownerName, "Nombre completo");
  assert.equal(mapping.phone, "Teléfono oficina");
  const { staged, mapped } = preview(parsed.rows, parsed.headers, mapping);
  assert.equal(parsed.rows.length, 127);
  assert.equal(staged.rows.length, 127);
  assert.equal(mapped.length, 127);
  for (const [index, row] of parsed.rows.entries()) {
    assert.ok(staged.rows[index].contacto_principal === row["Nombre completo"],
      `Propietario conservado en carga temporal: fila ${index + 1}`);
    assert.ok(staged.rows[index].telefono_oficina_contacto === row["Teléfono oficina"],
      `Telefono conservado en carga temporal: fila ${index + 1}`);
    assert.ok(mapped[index].ownerName === row["Nombre completo"],
      `Propietario conservado en previsualizacion: fila ${index + 1}`);
    assert.ok(mapped[index].phone === row["Teléfono oficina"],
      `Telefono conservado en previsualizacion: fila ${index + 1}`);
    const lead = buildLeadFromMapped(mapped[index]);
    assert.ok(lead.ownerName === row["Nombre completo"].trim(),
      `Propietario conservado en lead: fila ${index + 1}`);
    assert.ok(lead.phone === row["Teléfono oficina"].trim(),
      `Telefono conservado en lead: fila ${index + 1}`);
  }
  const valid = mapped.filter(row => validateMappedRow(row).valid).length;
  assert.equal(valid, 127);
  console.log(`CSV Kommo: ${mapped.length} filas, ${valid} validas, ${mapped.length - valid} invalidas.`);
}

console.log("OK: alias Kommo, encabezados anteriores, normalizacion y mapeos existentes.");
