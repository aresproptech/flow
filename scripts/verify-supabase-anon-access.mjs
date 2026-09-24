import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
  process.exit(2);
}

const supabase = createClient(url, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const protectedRelations = [
  "crm_leads_view",
  "opportunities",
  "opportunity_activities",
  "opportunity_orders",
  "opportunity_buyers",
  "profiles",
  "opportunity_documentation_cases",
  "opportunity_documentation_files",
  "phases", "sources", "postal", "domain", "lookups", "opportunity_history",
];

let exposed = false;
let invalidConfiguration = false;

for (const relation of protectedRelations) {
  const { count, error } = await supabase
    .from(relation)
    .select("*", { count: "exact" }).limit(1);

  if (error) {
    if (error.code === "42501") {
      console.log(`${relation}: bloqueada por permisos (42501)`);
      continue;
    }

    console.error(
      `${relation}: no se pudo verificar (${error.code || "sin código"}) ${error.message}`
    );
    invalidConfiguration = true;
    continue;
  }

  const visibleRows = count ?? 0;
  console.log(`${relation}: ${visibleRows} filas visibles para anon`);
  if (visibleRows > 0) exposed = true;
}

if (invalidConfiguration) {
  console.error(
    "FALLO: faltan relaciones o hubo errores que impiden verificar la configuración."
  );
  process.exit(2);
}

if (exposed) {
  console.error(
    "FALLO: una sesión anónima todavía puede ver filas protegidas del CRM."
  );
  process.exit(1);
}

console.log("OK: ninguna fila protegida es visible para una sesión anónima.");
