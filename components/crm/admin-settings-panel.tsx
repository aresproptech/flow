import Link from "next/link";
import { FileSpreadsheet, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminOpportunityImport } from "@/components/crm/admin-opportunity-import";

export function AdminSettingsPanel() {
  return (
    <main className="mt-14 flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="shrink-0 border-b border-border bg-card px-6 py-2.5">
        <span className="text-xs text-muted-foreground">Herramientas de administración</span>
      </div>

      <div className="grid content-start gap-4 p-4 sm:p-6 lg:grid-cols-2">
        <Card className="rounded-md shadow-none">
          <CardHeader className="flex flex-row items-start gap-3">
            <UserRoundCog className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1">
              <CardTitle className="text-sm">Gestión de usuarios</CardTitle>
              <CardDescription>Administra perfiles, roles y accesos del CRM.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex justify-end">
            <Button asChild size="sm">
              <Link href="/usuarios" aria-label="Administrar usuarios">
                Administrar usuarios
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-none">
          <CardHeader className="flex flex-row items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1">
              <CardTitle className="text-sm">Importación de oportunidades</CardTitle>
              <CardDescription>Carga un archivo CSV, revisa las filas y crea oportunidades.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <AdminOpportunityImport />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}