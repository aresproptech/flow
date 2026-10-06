import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("q") ?? "";
  const normalizedQuery = rawQuery
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");

  if (normalizedQuery.length > 80) {
    return NextResponse.json(
      { error: "La búsqueda no puede superar 80 caracteres." },
      { status: 400 }
    );
  }

  const query = normalizedQuery
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (query.length < 2 || !/[\p{L}\p{N}]/u.test(query)) {
    return NextResponse.json(
      { error: "Escribe al menos 2 letras o números para buscar." },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const filters = [
    `distrito.ilike.%${query}%`,
    `provincia.ilike.%${query}%`,
  ];

  if (/^\d{2,5}$/.test(query)) {
    const lowerBound = Number(query.padEnd(5, "0"));
    const upperBound = Number(query.padEnd(5, "9"));
    filters.unshift(`and(id.gte.${lowerBound},id.lte.${upperBound})`);
  }

  const { data, error } = await supabase
    .from("postal")
    .select("id, provincia, distrito")
    .or(filters.join(","))
    .order("id", { ascending: true })
    .limit(20);

  if (error) {
    console.error("Error buscando códigos postales:", error.code);
    return NextResponse.json(
      { error: "No se pudieron buscar los códigos postales." },
      { status: 500 }
    );
  }

  const results = (data ?? []).map((row) => {
    const id = String(row.id);
    return {
      id,
      cp: id.padStart(5, "0"),
      provincia: row.provincia ?? "",
      distrito: row.distrito,
      municipio: null,
    };
  });

  return NextResponse.json({ results });
}