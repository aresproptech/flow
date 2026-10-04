import { MapPin, Phone, Tag } from "lucide-react";
import { type Lead } from "@/lib/crm-data";
import { cn } from "@/lib/utils";
import { MaskedPhone } from "@/components/crm/masked-phone";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  activa: {
    label: "Activa",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  caliente: {
    label: "Caliente",
    className: "bg-orange-50 text-orange-700 border-orange-200",
  },
  desestimada: {
    label: "Desestimada",
    className: "bg-muted text-muted-foreground border-border",
  },
};

interface LeadCardProps {
  lead: Lead;
  onClick?: () => void;
}

function getStatusConfig(status: string) {
  const key = status
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    !key ||
    key === "identificar" ||
    key === "identificada" ||
    key === "identificado" ||
    key === "cualificada" ||
    key === "seguimiento"
  ) {
    return STATUS_CONFIG.activa;
  }

  return STATUS_CONFIG[key] ?? STATUS_CONFIG.activa;
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const status = getStatusConfig(lead.status);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border border-border bg-card p-3 text-left shadow-sm",
        "transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md",
        "focus:outline-none focus:ring-2 focus:ring-primary/30"
      )}
      aria-label={`Abrir lead: ${lead.ownerName || "Sin propietario"}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-snug text-foreground">
            {lead.ownerName || "Sin propietario"}
          </p>
          <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground">
            {lead.address || "Sin domicilio"}
          </p>
        </div>

        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            status.className
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="mb-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 shrink-0" />
          <MaskedPhone value={lead.phone} />
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {[lead.distrito, lead.cp].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <Tag className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{lead.source || "Sin origen"}</span>
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {lead.owner || "Sin owner"}
        </span>
      </div>
    </button>
  );
}
