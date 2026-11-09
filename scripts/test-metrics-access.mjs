import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/crm-role") {
      return nextResolve(new URL("../lib/crm-role.ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { canViewMetrics, canViewCommercialMetrics } = await import("../lib/metrics-access.ts");
const profile = { id: 1, auth_id: "test", name: "Test", enabled: true, can_manage_visits: false };
const cases = [
  { rol: "Admin", general: true, commercial: true },
  { rol: "Coordinador", general: true, commercial: true },
  { rol: "Comercial", general: true, commercial: false },
  { rol: "Comercial", can_manage_visits: true, general: false, commercial: false },
  { rol: "Partner", general: false, commercial: false },
  { rol: null, general: false, commercial: false },
  { rol: " desconocido ", general: false, commercial: false },
  { rol: " ADMIN ", general: true, commercial: true },
  { rol: " coordinador ", general: true, commercial: true },
  { rol: " comercial ", can_manage_visits: true, general: false, commercial: false },
  { rol: "Admin", can_manage_visits: true, general: true, commercial: true },
];

for (const { general, commercial, ...overrides } of cases) {
  const user = { ...profile, ...overrides };
  assert.equal(canViewMetrics(user), general, `General access: ${JSON.stringify(overrides)}`);
  assert.equal(canViewCommercialMetrics(user), commercial, `Commercial access: ${JSON.stringify(overrides)}`);
}

console.log(`Metrics permissions: ${cases.length} role/flag cases passed.`);
