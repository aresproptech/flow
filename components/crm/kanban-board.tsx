import { type Lead } from "@/lib/crm-data";
import { PipelineColumn, type PipelinePhase } from "./pipeline-column";

const COLUMNS: { phase: PipelinePhase; label: string }[] = [
  { phase: "identificada", label: "Identificada" },
  { phase: "cualificada", label: "Cualificada" },
  { phase: "valorada", label: "Valorada" },
  { phase: "encargo", label: "Encargo" },
];

type KanbanBoardProps = {
  leads: Lead[];
  onOpenLead: (lead: Lead) => void;
  onMoveLead?: (leadId: string, nextPhase: PipelinePhase) => void;
  hideEmptyColumns?: boolean;
};

export function KanbanBoard({
  leads,
  onOpenLead,
  onMoveLead,
  hideEmptyColumns = false,
}: KanbanBoardProps) {
  const visibleColumns = hideEmptyColumns
    ? COLUMNS.filter(({ phase }) => leads.some((lead) => lead.phase === phase))
    : COLUMNS;

  if (visibleColumns.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-center text-sm text-muted-foreground">
        No se encontraron leads para esta búsqueda.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden">
      {visibleColumns.map(({ phase, label }) => (
        <PipelineColumn
          key={phase}
          phase={phase}
          label={label}
          leads={leads.filter((lead) => lead.phase === phase)}
          onOpenLead={onOpenLead}
          onMoveLead={onMoveLead}
        />
      ))}
    </div>
  );
}
