import type { DragEvent } from "react";
import { type Lead } from "@/lib/crm-data";
import { LeadCard } from "./lead-card";

export type PipelinePhase = "identificada" | "cualificada" | "valorada" | "encargo";

interface PipelineColumnProps {
  phase: PipelinePhase;
  label: string;
  leads: Lead[];
  onOpenLead: (lead: Lead) => void;
  onMoveLead?: (leadId: string, nextPhase: PipelinePhase) => void;
}

export function PipelineColumn({
  phase,
  label,
  leads,
  onOpenLead,
  onMoveLead,
}: PipelineColumnProps) {
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const leadId =
      event.dataTransfer.getData("application/x-crm-lead-id") ||
      event.dataTransfer.getData("text/plain");

    if (!leadId || !onMoveLead) {
      return;
    }

    onMoveLead(leadId, phase);
  };

  return (
    <section className="flex h-full min-h-0 w-[calc(100vw-3.5rem)] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-column-bg sm:w-[320px]">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
            {label}
          </span>
        </div>
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-border bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
          {leads.length}
        </span>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {leads.length > 0 ? (
          leads.map((lead) => (
            <div
              key={lead.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-crm-lead-id", lead.id);
                event.dataTransfer.setData("text/plain", lead.id);
              }}
            >
              <LeadCard
                lead={lead}
                onClick={() => onOpenLead(lead)}
              />
            </div>
          ))
        ) : (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border bg-background/60 px-3 text-center text-xs text-muted-foreground">
            No hay leads en esta fase.
          </div>
        )}
      </div>
    </section>
  );
}
