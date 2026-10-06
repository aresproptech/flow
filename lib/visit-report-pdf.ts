import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

export type VisitReportVisit = {
  fecha_visita?: string | null;
  nombre_apellido?: string | null;
  buyer?: string | null;
  dni?: string | null;
  observaciones_visita?: string | null;
  notas?: string | null;
};

export type VisitReportProperty = {
  address?: string | null;
  postalCode?: string | null;
  district?: string | null;
  province?: string | null;
};

export type VisitReportInput = {
  opportunityId: string | number;
  property: VisitReportProperty;
  visits: VisitReportVisit[];
  logoDataUrl: string;
  fonts: {
    regular: string;
    bold: string;
  };
};

function textOrEmpty(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function formatVisitReportDate(value: string | null | undefined) {
  const normalized = textOrEmpty(value);
  if (!normalized) return "—";

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalized);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export function mapVisitReportRows(visits: VisitReportVisit[]) {
  return visits.map((visit, index) => ({
    nro: index + 1,
    fecha: formatVisitReportDate(visit.fecha_visita),
    cliente:
      textOrEmpty(visit.nombre_apellido) || textOrEmpty(visit.buyer) || "—",
    dni: textOrEmpty(visit.dni) || "—",
    memo:
      textOrEmpty(visit.observaciones_visita) || textOrEmpty(visit.notas) || "—",
  }));
}

export function buildVisitReportTitle(property: VisitReportProperty) {
  const propertyParts = [
    property.address,
    property.postalCode,
    property.district,
    property.province,
  ]
    .map(textOrEmpty)
    .filter((value) => value && value !== "—" && value !== "-");

  return `Parte de Visitas: ${propertyParts.join(", ")}`;
}

function filenamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildVisitReportFilename(
  opportunityId: string | number,
  address: string | null | undefined
) {
  const safeId = filenamePart(String(opportunityId)) || "oportunidad";
  const safeAddress = filenamePart(textOrEmpty(address)) || "inmueble";
  return `parte-visitas-${safeId}-${safeAddress}.pdf`;
}

export async function fetchAresLogoDataUrl() {
  const response = await fetch("/ares-report-logo.png", { cache: "force-cache" });
  if (!response.ok) {
    throw new Error("No se pudo cargar el logo de Ares Proptech.");
  }

  const logo = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("No se pudo preparar el logo del reporte."));
      }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el logo del reporte."));
    reader.readAsDataURL(logo);
  });
}

async function fetchFontBase64(url: string) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error("No se pudieron cargar las fuentes del reporte.");
  }

  const fontBlob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result.split(",")[1] ?? "");
      } else {
        reject(new Error("No se pudieron preparar las fuentes del reporte."));
      }
    };
    reader.onerror = () => reject(new Error("No se pudieron leer las fuentes del reporte."));
    reader.readAsDataURL(fontBlob);
  });
}

export async function fetchVisitReportFonts() {
  const [regular, bold] = await Promise.all([
    fetchFontBase64("/fonts/SourceSans3-Regular.ttf"),
    fetchFontBase64("/fonts/SourceSans3-Bold.ttf"),
  ]);

  return { regular, bold };
}

export function createVisitReportPdf({
  opportunityId,
  property,
  visits,
  logoDataUrl,
  fonts,
}: VisitReportInput) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.addFileToVFS("SourceSans3-Regular.ttf", fonts.regular);
  doc.addFont("SourceSans3-Regular.ttf", "SourceSans3", "normal");
  doc.addFileToVFS("SourceSans3-Bold.ttf", fonts.bold);
  doc.addFont("SourceSans3-Bold.ttf", "SourceSans3", "bold");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const title = buildVisitReportTitle(property);
  const titleX = 68;
  const titleWidth = pageWidth - titleX - 14;

  doc.setProperties({
    title,
    subject: `Parte de visitas de la oportunidad ${opportunityId}`,
    creator: "Ares Proptech CRM",
  });

  doc.setFont("SourceSans3", "bold");
  doc.setFontSize(14);
  doc.setTextColor(46, 56, 64);
  const titleLines = doc.splitTextToSize(title, titleWidth);

  const tableStartY = Math.max(41, 18 + titleLines.length * 5.5 + 8);
  const rows = mapVisitReportRows(visits);

  autoTable(doc, {
    head: [["Nro.", "Fecha", "Cliente", "DNI", "Memo"]],
    body: rows.map((row) => [String(row.nro), row.fecha, row.cliente, row.dni, row.memo]),
    startY: tableStartY,
    showHead: "everyPage",
    rowPageBreak: "avoid",
    theme: "grid",
    margin: { top: tableStartY, right: 14, bottom: 18, left: 14 },
    willDrawPage: ({ pageNumber }) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");

      if (pageNumber !== 1) return;
      doc.addImage(logoDataUrl, "PNG", 14, 12, 50, 19.4, "ares-report-logo", "FAST");
      doc.setFont("SourceSans3", "bold");
      doc.setFontSize(14);
      doc.setTextColor(46, 56, 64);
      doc.text(titleLines, titleX + titleWidth / 2, 18, {
        align: "center",
        lineHeightFactor: 1.2,
      });
    },
    styles: {
      font: "SourceSans3",
      fontSize: 9,
      cellPadding: { top: 2.8, right: 3, bottom: 2.8, left: 3 },
      overflow: "linebreak",
      valign: "top",
      textColor: [88, 88, 88],
      lineColor: [215, 227, 232],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [0, 76, 112],
      textColor: [255, 255, 255],
      font: "SourceSans3",
      fontStyle: "bold",
      valign: "top",
    },
    alternateRowStyles: { fillColor: [247, 247, 247] },
    columnStyles: {
      0: { cellWidth: 16, halign: "center", valign: "top" },
      1: { cellWidth: 24, valign: "top" },
      2: { cellWidth: 52 },
      3: { cellWidth: 28 },
      4: { cellWidth: "auto", minCellWidth: 140 },
    },
  });

  const pageCount = doc.getNumberOfPages();
  if (pageCount > 1) {
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont("SourceSans3", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 124);
      doc.text(`Página ${page} de ${pageCount}`, pageWidth - 14, pageHeight - 8, {
        align: "right",
      });
    }
  }

  return doc;
}