"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PostalCodeResult {
  id: string;
  cp: string;
  municipio: string | null;
  provincia: string;
  distrito: string | null;
}

export function AdminLocalizationSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PostalCodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedCp, setSelectedCp] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<PostalCodeResult | null>(null);

  useEffect(() => {
    const searchQuery = query.trim().replace(/\s+/g, " ");
    if (searchQuery.length < 2 || selectedCp === searchQuery) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/postal-search?q=${encodeURIComponent(searchQuery)}`,
          { signal: controller.signal }
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "No se pudieron buscar los CP.");
        }

        setResults(payload.results as PostalCodeResult[]);
        setActiveIndex(0);
        setOpen(true);
      } catch (searchError) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "No se pudieron buscar los códigos postales."
        );
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, selectedCp]);

  function handleChange(value: string) {
    const nextQuery = value.slice(0, 80);
    setQuery(nextQuery);
    setSelectedCp(null);
    setSelectedResult(null);
    setResults([]);
    setError(null);
    setActiveIndex(0);
    setLoading(nextQuery.trim().length >= 2);
    setOpen(nextQuery.trim().length >= 2);
  }

  function selectResult(result: PostalCodeResult) {
    const cp = String(Number(result.id)).padStart(5, "0");
    setQuery(cp);
    setSelectedCp(cp);
    setSelectedResult({ ...result, cp });
    setResults([]);
    setLoading(false);
    setError(null);
    setOpen(false);
  }

  function clearSearch() {
    setQuery("");
    setSelectedCp(null);
    setSelectedResult(null);
    setResults([]);
    setLoading(false);
    setError(null);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
      return;
    }

    if (event.key === "Enter" && open) {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) selectResult(result);
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative" onBlur={handleBlur}>
        <Input
          value={query}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim().length >= 2 && selectedCp !== query.trim()) {
              setOpen(true);
            }
          }}
          placeholder="Buscar CP o localidad"
          maxLength={80}
          className="h-9 pr-9 text-sm"
          role="combobox"
          aria-label="Buscar código postal o localidad"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="admin-localization-options"
          aria-activedescendant={
            open && results[activeIndex]
              ? `admin-localization-option-${activeIndex}`
              : undefined
          }
          aria-busy={loading}
        />
        {loading ? (
          <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-primary" />
        ) : query ? (
          <button
            type="button"
            aria-label="Limpiar búsqueda de código postal"
            onMouseDown={(event) => event.preventDefault()}
            onClick={clearSearch}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}

        {open && query.trim().length >= 2 && (
          <div
            id="admin-localization-options"
            role="listbox"
            aria-label="Resultados de códigos postales"
            className="absolute left-0 top-full z-50 mt-1 max-h-[55vh] w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {loading ? (
              <div role="status" className="px-3 py-2 text-sm text-muted-foreground">
                Buscando...
              </div>
            ) : error ? (
              <div role="alert" className="px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : results.length === 0 ? (
              <div role="status" className="px-3 py-2 text-sm text-muted-foreground">
                No se encontraron resultados.
              </div>
            ) : (
              results.map((result, index) => (
                <button
                  key={result.id}
                  id={`admin-localization-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectResult(result)}
                  className={cn(
                    "w-full rounded-sm px-3 py-2 text-left text-sm outline-none",
                    index === activeIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/60"
                  )}
                >
                  {[result.cp, result.distrito, result.provincia]
                    .filter(Boolean)
                    .join(" · ")}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedResult && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">{selectedResult.cp}</p>
            <p className="text-muted-foreground">
              {[selectedResult.distrito, selectedResult.provincia]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}