import * as React from "react";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

export interface LeadObservation {
  id: string;
  date: string; // ISO string or yyyy-mm-dd
  text: string;
}

interface LeadObservationsTimelineProps {
  className?: string;
  initialObservations?: LeadObservation[];
  onObservationsChange?: (observations: LeadObservation[]) => void;
}

export function LeadObservationsTimeline({
  className,
  initialObservations = [],
  onObservationsChange,
}: LeadObservationsTimelineProps) {
  const [observations, setObservations] =
    React.useState<LeadObservation[]>(initialObservations);
  const [date, setDate] = React.useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [text, setText] = React.useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    const next: LeadObservation = {
      id: crypto.randomUUID(),
      date,
      text: text.trim(),
    };

    const nextList = [next, ...observations].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    setObservations(nextList);
    setText("");

    if (onObservationsChange) {
      onObservationsChange(nextList);
    }
  }

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border bg-card p-4",
        className
      )}
      aria-label="Observaciones del lead"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Observaciones
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {observations.length}{" "}
          {observations.length === 1 ? "entrada" : "entradas"}
        </span>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-muted-foreground">
            Fecha
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-0.5 block h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Añade una nueva observación..."
            rows={3}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!text.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Guardar observación
            </button>
          </div>
        </div>
      </form>

      <ol className="mt-2 space-y-3 text-xs">
        {observations.length === 0 && (
          <li className="text-[11px] text-muted-foreground">
            Aún no hay observaciones para este lead.
          </li>
        )}

        {observations.map((obs) => (
          <li key={obs.id} className="relative pl-4">
            <div className="absolute left-0 top-1 h-2 w-2 rounded-full bg-primary" />
            <div className="flex flex-col gap-0.5 rounded-md bg-muted/60 px-2 py-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                {new Date(obs.date).toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                })}
              </span>
              <p className="text-xs text-foreground whitespace-pre-line">
                {obs.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

