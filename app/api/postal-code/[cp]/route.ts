import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export interface PostalCodeResult {
  id: string;
  cp: string;
  municipio: string;
  provincia: string;
  distrito: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cp: string }> }
) {
  const { cp } = await params;

  if (!/^\d{5}$/.test(cp)) {
    return NextResponse.json(
      { error: "El código postal debe tener 5 dígitos." },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Sesión no válida." },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("postal")
    .select("id, provincia, distrito")
    .eq("id", Number(cp))
    .maybeSingle();

  if (error) {
    console.error("Error consultando el código postal:", error.code);
    return NextResponse.json(
      { error: "No se pudo consultar el código postal." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "CP no encontrado." },
      { status: 404 }
    );
  }

  const result: PostalCodeResult = {
    id: String(data.id),
    cp: String(data.id).padStart(5, "0"),
    municipio: "",
    provincia: data.provincia ?? "",
    distrito: data.distrito ?? null,
  };

  return NextResponse.json(result);
}
