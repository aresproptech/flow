"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseCsvText } from "@/lib/csv";
import {
  IMPORT_TARGET_FIELDS,
  suggestMapping,
  type ImportTargetField,
  mapCsvRowToTargets,
  mapOpportunityLoaderRowsToTargets,
  type OpportunityLoaderRow,
  validateMappedRow,
  buildLeadFromMapped,
} from "@/lib/leads-csv-import";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import type { Lead } from "@/lib/crm-data";

type Step = 1 | 2;
type PreviewFilter = "all" | "valid" | "invalid";
type MappedCsvLeadRow = ReturnType<typeof mapCsvRowToTargets>;

function stepLabel(step: Step) {
  switch (step) {
    case 1:
      return "Subir archivo";
    case 2:
      return "Previsualizar";
  }
}

function getValidationErrors(result: ReturnType<typeof validateMappedRow>) {
  if ("errors" in result && Array.isArray(result.errors)) {
    return result.errors.map(String);
  }

  if ("missing" in result && Array.isArray(result.missing)) {
    return result.missing.map((field) => `Falta ${String(field)}`);
  }

  return result.valid ? [] : ["Faltan campos requeridos o hay datos inválidos."];
}

export function ImportLeadsCsvModal({
  open,
  onOpenChange,
  onLoadOpportunityRows,
  onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLoadOpportunityRows: (
    rows: Record<string, string>[]
  ) => Promise<OpportunityLoaderRow[] | string>;
  onImport: (leads: Lead[]) => Promise<string | null>;
}) {
  const [step, setStep] = React.useState<Step>(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [rawText, setRawText] = React.useState("");
  const [editedRows, setEditedRows] = React.useState<MappedCsvLeadRow[]>([]);
  const [previewFilter, setPreviewFilter] = React.useState<PreviewFilter>("all");
  const [error, setError] = React.useState<string | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const [loaderLoadedForCurrentFile, setLoaderLoadedForCurrentFile] = React.useState(false);
  const [loaderRows, setLoaderRows] = React.useState<OpportunityLoaderRow[]>([]);
  const [loaderLoadedCount, setLoaderLoadedCount] = React.useState(0);

  const validation = React.useMemo(() => {
    const results = editedRows.map((mapped, index) => {
      const v = validateMappedRow(mapped);
      return {
        index,
        mapped,
        ...v,
        errors: getValidationErrors(v),
      };
    });

    const valid = results.filter((x) => x.valid).length;

    return {
      total: results.length,
      valid,
      invalid: results.length - valid,
      results,
    };
  }, [editedRows]);

  const visiblePreviewRows = React.useMemo(() => {
    if (previewFilter === "valid") {
      return validation.results.filter((row) => row.valid);
    }

    if (previewFilter === "invalid") {
      return validation.results.filter((row) => !row.valid);
    }

    return validation.results;
  }, [previewFilter, validation.results]);

  function resetAll() {
    setStep(1);
    setFile(null);
    setRawText("");
    setEditedRows([]);
    setPreviewFilter("all");
    setError(null);
    setLoaderLoadedForCurrentFile(false);
    setLoaderRows([]);
    setLoaderLoadedCount(0);
  }

  React.useEffect(() => {
    if (!open) resetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleFileSelected(f: File | null) {
    setError(null);
    setFile(f);
    setRawText("");
    setEditedRows([]);
    setPreviewFilter("all");
    setLoaderLoadedForCurrentFile(false);
    setLoaderRows([]);
    setLoaderLoadedCount(0);

    if (!f) return;

    if (!f.name.toLowerCase().endsWith(".csv")) {
      setError("Solo se permiten archivos .csv");
      return;
    }

    if (f.size === 0) {
      setError("El archivo está vacío.");
      return;
    }

    const text = await f.text();

    if (!text.trim()) {
      setError("El archivo está vacío.");
      return;
    }

    setRawText(text);
  }

  async function continueFromUpload() {
    if (isImporting || !rawText.trim()) return;

    setIsImporting(true);
    try {
      setError(null);
      const parsed = parseCsvText(rawText);
      let persistedRows = loaderRows;
      if (!loaderLoadedForCurrentFile) {
        const loadResult = await onLoadOpportunityRows(parsed.rows);
        if (typeof loadResult === "string") {
          setError(loadResult);
          return;
        }

        persistedRows = loadResult;
        setLoaderLoadedForCurrentFile(true);
        setLoaderRows(persistedRows);
        setLoaderLoadedCount(persistedRows.length);
      }

      const autoMapping = suggestMapping(parsed.headers);
      setEditedRows(
        mapOpportunityLoaderRowsToTargets(
          persistedRows,
          parsed.headers,
          autoMapping
        )
      );
      setPreviewFilter("all");
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo parsear el CSV.");
    } finally {
      setIsImporting(false);
    }
  }

  function updatePreviewCell(rowIndex: number, field: ImportTargetField, value: string) {
    setEditedRows((prev) =>
      prev.map((row, index) =>
        index === rowIndex
          ? ({
              ...row,
              [field]: value,
            } as MappedCsvLeadRow)
          : row
      )
    );
  }

  function removePreviewRow(rowIndex: number) {
    setEditedRows((prev) => prev.filter((_, index) => index !== rowIndex));
  }

  function removeInvalidPreviewRows() {
    const invalidIndexes = new Set(
      validation.results.filter((row) => !row.valid).map((row) => row.index)
    );

    setEditedRows((prev) => prev.filter((_, index) => !invalidIndexes.has(index)));
    setPreviewFilter("all");
  }

  async function doImport() {
    if (isImporting) return;

    const validMapped = validation.results
      .filter((r) => r.valid)
      .map((r) => r.mapped);
    const leads = validMapped.map(buildLeadFromMapped);

    setIsImporting(true);
    setError(null);
    try {
      const errorMessage = await onImport(leads);
      if (errorMessage) {
        setError(errorMessage);
        return;
      }
      onOpenChange(false);
    } catch (importError) {
      console.error("Error inesperado importando leads:", importError);
      setError("No se pudieron importar los leads. Intentá nuevamente.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isImporting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="h-[92vh] w-[96vw] max-w-[96vw] overflow-hidden p-0 sm:max-w-[96vw] lg:max-w-[96vw] xl:max-w-[96vw]">
        <div className="flex h-full flex-col">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle className="text-base font-semibold">Importar CSV</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Importa leads desde CSV con asignación automática de columnas y revisión previa.
            </DialogDescription>

            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-[11px] text-muted-foreground">
                Paso {step} de 2 · <span className="font-medium">{stepLabel(step)}</span>
              </div>
              {file && (
                <div className="max-w-[60%] truncate text-[11px] text-muted-foreground">
                  Archivo: <span className="font-medium text-foreground">{file.name}</span>
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-3">
            {error && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-foreground">Archivo CSV</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
                      className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted"
                    />
                  </div>
                </label>

                <div className="text-[11px] text-muted-foreground">
                  Soporta delimitador por coma o punto y coma, y CSV con UTF-8.
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="shrink-0 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">
                        Total: <span className="font-medium text-foreground">{validation.total}</span> ·{" "}
                        Válidas: <span className="font-medium text-foreground">{validation.valid}</span> ·{" "}
                        Inválidas:{" "}
                        <span className={cn("font-medium", validation.invalid ? "text-destructive" : "text-foreground")}>
                          {validation.invalid}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {loaderLoadedForCurrentFile && (
                        <div className="text-[11px] text-emerald-700">
                          Cargadas en opportunity_loader: {loaderLoadedCount}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 rounded-md border border-border bg-background p-1">
                          {([
                            ["all", `Todas (${validation.total})`],
                            ["valid", `Válidas (${validation.valid})`],
                            ["invalid", `Inválidas (${validation.invalid})`],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setPreviewFilter(value)}
                              className={cn(
                                "rounded px-3 py-1.5 text-[11px] font-semibold transition",
                                previewFilter === value
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={validation.invalid === 0}
                          onClick={removeInvalidPreviewRows}
                          className="h-8 text-xs"
                        >
                          Eliminar inválidas
                        </Button>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        disabled={validation.valid === 0 || isImporting}
                        onClick={() => void doImport()}
                        className="h-10 w-full max-w-[420px] text-xs font-semibold"
                      >
                        {isImporting ? "Importando..." : `Aceptar e importar ${validation.valid} leads válidos`}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 rounded-lg border border-border">
                  <div className="h-[calc(92vh-390px)] min-h-[240px] overflow-auto">
                    <table className="border-collapse text-xs" style={{ minWidth: 2400 }}>
                      <thead className="sticky top-0 z-10 bg-card">
                        <tr className="border-b border-border bg-card/95 text-left backdrop-blur">
                          <th className="w-[90px] px-3 py-2 whitespace-nowrap">Estado</th>
                          <th className="w-[260px] px-3 py-2 whitespace-nowrap">Errores</th>
                          <th className="w-[110px] px-3 py-2 whitespace-nowrap">Acción</th>
                          {IMPORT_TARGET_FIELDS.filter((f) => f.key !== "planner").map((f) => (
                            <th key={f.key} className="px-3 py-2 whitespace-nowrap">
                              {f.label}
                              {f.required && <span className="text-destructive"> *</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-background">
                        {visiblePreviewRows.map((row) => (
                          <tr
                            key={row.index}
                            className={cn(
                              "border-b border-border",
                              !row.valid && "bg-destructive/5"
                            )}
                          >
                            <td className="px-3 py-2 whitespace-nowrap align-top">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
                                  row.valid
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-destructive/30 bg-destructive/5 text-destructive"
                                )}
                              >
                                {row.valid ? "Válida" : "Inválida"}
                              </span>
                            </td>

                            <td className="max-w-[260px] px-3 py-2 align-top text-[11px] text-muted-foreground">
                              {row.errors.length > 0 ? (
                                <ul className="list-disc space-y-0.5 pl-4">
                                  {row.errors.map((err, errIndex) => (
                                    <li key={`${row.index}-${errIndex}`}>{err}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span>—</span>
                              )}
                            </td>

                            <td className="px-3 py-2 whitespace-nowrap align-top">
                              {!row.valid ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removePreviewRow(row.index)}
                                  className="h-7 text-[11px]"
                                >
                                  Eliminar
                                </Button>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
                              )}
                            </td>

                            {IMPORT_TARGET_FIELDS.filter((f) => f.key !== "planner").map((f) => (
                              <td key={f.key} className="px-2 py-1.5 align-top">
                                <input
                                  value={row.mapped[f.key]?.toString() || ""}
                                  onChange={(e) => updatePreviewCell(row.index, f.key, e.target.value)}
                                  className={cn(
                                    "h-8 w-full min-w-[150px] rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                                    !row.valid && f.required && !row.mapped[f.key]?.toString().trim()
                                      ? "border-destructive/50 bg-destructive/5"
                                      : ""
                                  )}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="shrink-0 rounded-lg border border-border bg-card px-3 py-3 shadow-sm">
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={validation.valid === 0 || isImporting}
                      onClick={() => void doImport()}
                      className="h-10 w-full text-xs font-semibold"
                    >
                      {isImporting ? "Importando..." : `Aceptar e importar ${validation.valid} leads válidos`}
                    </Button>

                    <div className="text-xs text-muted-foreground">
                      {validation.invalid > 0 ? (
                        <span>
                          Hay {validation.invalid} filas inválidas. Tocá “Inválidas” para verlas, corregilas o eliminá las filas que no quieras importar.
                        </span>
                      ) : (
                        <span>Todas las filas visibles están listas para importar.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="sticky bottom-0 z-20 shrink-0 border-t border-border bg-card px-5 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isImporting}
            >
              Cerrar
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={step === 1 || isImporting}
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
              >
                Atrás
              </Button>

              {step === 1 && (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={!file || !rawText.trim() || isImporting}
                  onClick={() => void continueFromUpload()}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Cargando...
                    </>
                  ) : (
                    <>
                      <FileUp className="h-3.5 w-3.5" />
                      Continuar
                    </>
                  )}
                </Button>
              )}

              {step === 2 && (
                <Button
                  type="button"
                  size="sm"
                  disabled={validation.valid === 0 || isImporting}
                  onClick={() => void doImport()}
                  className="h-9 min-w-[320px] text-xs font-semibold"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    `Aceptar e importar ${validation.valid} leads válidos`
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
