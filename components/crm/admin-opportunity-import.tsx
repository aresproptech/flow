"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportLeadsCsvModal } from "@/components/crm/import-leads-csv-modal";
import {
  insertImportedLeads,
  insertOpportunityLoaderRows,
} from "@/lib/opportunity-import";
import type { Lead } from "@/lib/crm-data";
import type { OpportunityLoaderRow } from "@/lib/leads-csv-import";

export function AdminOpportunityImport() {
  const [open, setOpen] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  async function handleLoadRows(
    csvRows: Record<string, string>[]
  ): Promise<OpportunityLoaderRow[] | string> {
    const result = await insertOpportunityLoaderRows(csvRows);
    return "error" in result ? result.error : result.rows;
  }

  async function handleImport(leads: Lead[]) {
    const error = await insertImportedLeads(leads);
    if (!error) setImportedCount(leads.length);
    return error;
  }

  return (
    <>
      {importedCount !== null && (
        <div
          className="flex flex-col gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 sm:flex-row sm:items-center sm:justify-between"
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Se importaron {importedCount} oportunidades correctamente.
          </span>
          <Button asChild size="sm" variant="outline">
            <Link href="/leads">Ir a Oportunidades</Link>
          </Button>
        </div>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5"
        onClick={() => {
          setImportedCount(null);
          setOpen(true);
        }}
        aria-label="Importar CSV de oportunidades"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
        Importar CSV
      </Button>

      <ImportLeadsCsvModal
        open={open}
        onOpenChange={setOpen}
        onLoadOpportunityRows={handleLoadRows}
        onImport={handleImport}
      />
    </>
  );
}