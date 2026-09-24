import { createBrowserClient } from "@supabase/ssr";

export type CrmUser = {
  id: number;
  auth_id: string | null;
  name: string | null;
  rol: "Admin" | "Coordinador" | "Comercial" | "Partner" | null;
  enabled: boolean | null;
  can_manage_visits: boolean;
};

// Cliente singleton para el browser
function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export const supabase = createClient();
