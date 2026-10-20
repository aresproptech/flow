"use client";

import { useEffect, useState } from "react";
import { supabase, type CrmUser } from "@/lib/supabase";
import { normalizeCrmRole } from "@/lib/crm-role";
import type { User } from "@supabase/supabase-js";

export type UserWithRole = {
  authUser: User;
  crmUser: CrmUser;
};

async function fetchCrmUser(userId: string): Promise<CrmUser | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_id", userId)
    .single();

  if (error || !data) return null;
  return data as CrmUser;
}

export function useUser() {
  const [userWithRole, setUserWithRole] = useState<UserWithRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();

      if (session && mounted) {
        const crmUser = await fetchCrmUser(session.user.id);
        if (crmUser && mounted) {
          setUserWithRole({ authUser: session.user, crmUser });
        }
        setLoading(false);
        return;
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (!session || !mounted) {
            setUserWithRole(null);
            setLoading(false);
            return;
          }

          const crmUser = await fetchCrmUser(session.user.id);
          if (crmUser && mounted) {
            setUserWithRole({ authUser: session.user, crmUser });
          }
          setLoading(false);
        }
      );

      return () => subscription.unsubscribe();
    }

    void init();

    return () => {
      mounted = false;
    };
  }, []);

  return { userWithRole, loading };
}

export function canViewAllLeads(crmUser: CrmUser): boolean {
  const role = normalizeCrmRole(crmUser.rol);
  return role === "admin" || role === "coordinador";
}

export function canEditLeads(crmUser: CrmUser): boolean {
  const role = normalizeCrmRole(crmUser.rol);
  if (canManageVisits(crmUser)) return false;
  return role === "admin" || role === "coordinador" || role === "comercial";
}

export function canManageVisits(crmUser: CrmUser): boolean {
  const role = normalizeCrmRole(crmUser.rol);
  return role === "comercial" && crmUser.can_manage_visits === true;
}

export const isVisitador = canManageVisits;
