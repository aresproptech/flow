export function normalizeCrmRole(role: string | null | undefined) {
  return (role ?? "").trim().toLowerCase();
}

export function isCrmAdmin(role: string | null | undefined) {
  return normalizeCrmRole(role) === "admin";
}