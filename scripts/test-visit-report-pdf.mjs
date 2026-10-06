import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  buildVisitReportFilename,
  buildVisitReportTitle,
  createVisitReportPdf,
  mapVisitReportRows,
} from "../lib/visit-report-pdf.ts";

const logo = await readFile(new URL("../public/ares-report-logo.png", import.meta.url));
const logoDataUrl = `data:image/png;base64,${logo.toString("base64")}`;
const fonts = {
  regular: (await readFile(new URL("../public/fonts/SourceSans3-Regular.ttf", import.meta.url))).toString("base64"),
  bold: (await readFile(new URL("../public/fonts/SourceSans3-Bold.ttf", import.meta.url))).toString("base64"),
};
const property = {
  address: "Calle Niño Jesús 18",
  postalCode: "28009",
  district: "Retiro",
  province: "Madrid",
};

function createVisit(index, overrides = {}) {
  return {
    fecha_visita: `2026-06-${String((index % 28) + 1).padStart(2, "0")}`,
    nombre_apellido: `Cliente ${index + 1}`,
    buyer: `Usuario ${index + 1}`,
    dni: `1234567${index}X`,
    observaciones_visita: `Visita número ${index + 1}. Información con acentos: acción, niño, corazón.`,
    ...overrides,
  };
}

async function writePdf(name, visits) {
  const pdf = createVisitReportPdf({
    opportunityId: "006389",
    property,
    visits,
    logoDataUrl,
    fonts,
  });
  const bytes = pdf.output("arraybuffer");
  assert.ok(bytes.byteLength > 1000, `${name}: generated PDF should not be empty`);
  await writeFile(`/tmp/ares-${name}.pdf`, Buffer.from(bytes));
  return pdf.getNumberOfPages();
}

assert.equal(
  buildVisitReportTitle({ address: "Calle Mayor", postalCode: "", district: "—", province: "Madrid" }),
  "Parte de Visitas: Calle Mayor, Madrid"
);
assert.equal(
  buildVisitReportFilename("006389", "Calle Niño Jesús 18"),
  "parte-visitas-006389-calle-nino-jesus-18.pdf"
);

const emptyFields = mapVisitReportRows([
  {
    fecha_visita: null,
    nombre_apellido: "",
    buyer: "",
    dni: "",
    observaciones_visita: "",
    notas: "Memo alternativo",
  },
]);
assert.deepEqual(emptyFields[0], {
  nro: 1,
  fecha: "—",
  cliente: "—",
  dni: "—",
  memo: "Memo alternativo",
});
assert.deepEqual(
  mapVisitReportRows([createVisit(0), createVisit(1)]).map((row) => row.nro),
  [1, 2]
);
assert.equal(mapVisitReportRows([createVisit(0)])[0].fecha, "01/06/2026");
assert.equal(mapVisitReportRows([createVisit(0, { nombre_apellido: "", buyer: "Comprador alternativo" })])[0].cliente, "Comprador alternativo");
assert.equal(mapVisitReportRows([createVisit(0, { observaciones_visita: "", notas: "Notas fallback" })])[0].memo, "Notas fallback");

const singlePages = await writePdf("single", [createVisit(0)]);
assert.equal(singlePages, 1);

const severalPages = await writePdf(
  "several",
  Array.from({ length: 6 }, (_, index) => createVisit(index))
);
assert.equal(severalPages, 1);

const longMemoPages = await writePdf("long-memo", [
  createVisit(0, {
    observaciones_visita: "Descripción extensa con información útil y caracteres españoles: áéíóú, ñ, ü. ".repeat(400),
  }),
]);
assert.ok(longMemoPages > 1, "long memo should wrap across pages instead of being clipped");

const manyVisitPages = await writePdf(
  "many-visits",
  Array.from({ length: 100 }, (_, index) => createVisit(index))
);
assert.ok(manyVisitPages > 1, "many visits should paginate");

console.log(
  JSON.stringify({
    singlePages,
    severalPages,
    longMemoPages,
    manyVisitPages,
    fixtures: [
      "/tmp/ares-single.pdf",
      "/tmp/ares-several.pdf",
      "/tmp/ares-long-memo.pdf",
      "/tmp/ares-many-visits.pdf",
    ],
  })
);