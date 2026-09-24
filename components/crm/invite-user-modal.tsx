"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export type UserRole = "Admin" | "Coordinador" | "Comercial" | "Partner";
export type UserStatus = "Activo" | "Inactivo";

export type ProfileFormData = {
  nombre: string;
  apellido: string;
  rol: UserRole | "";
  estado: UserStatus | "";
};

type SubmittedProfile = Omit<ProfileFormData, "rol" | "estado"> & {
  rol: UserRole;
  estado: UserStatus;
};

const EMPTY: ProfileFormData = {
  nombre: "",
  apellido: "",
  rol: "",
  estado: "Activo",
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export function InviteUserModal({
  open,
  onOpenChange,
  existingNames,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  existingNames: string[];
  onSubmit: (data: SubmittedProfile) => Promise<string | null>;
}) {
  const [form, setForm] = React.useState<ProfileFormData>(EMPTY);
  const [touched, setTouched] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setTouched(false);
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [open]);

  function set<K extends keyof ProfileFormData>(
    key: K,
    value: ProfileFormData[K]
  ) {
    setSubmitError(null);
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  const fullName = normalizeName(`${form.nombre} ${form.apellido}`);
  const duplicateName = existingNames.some(
    (name) => normalizeName(name) === fullName
  );
  const requiredOk = Boolean(
    form.nombre.trim() &&
      form.apellido.trim() &&
      form.rol &&
      form.estado &&
      !duplicateName
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!requiredOk || submitting) return;

    setSubmitting(true);
    const error = await onSubmit({
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      rol: form.rol as UserRole,
      estado: form.estado as UserStatus,
    });
    setSubmitting(false);

    if (error) {
      setSubmitError(error);
      return;
    }

    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!submitting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Crear perfil CRM
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            El perfil se guardará en Supabase. El acceso de autenticación se
            vincula por separado mediante su identificador de Auth.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-1 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.nombre}
                onChange={(event) => set("nombre", event.target.value)}
                className="h-8 text-sm"
                placeholder="Ej. Ana"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">
                Apellido <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.apellido}
                onChange={(event) => set("apellido", event.target.value)}
                onBlur={() => setTouched(true)}
                className="h-8 text-sm"
                placeholder="Ej. Martínez"
                required
              />
            </div>
          </div>

          {touched && duplicateName && (
            <span className="text-[11px] text-destructive">
              Ya existe un perfil con ese nombre.
            </span>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">
                Rol <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.rol}
                onValueChange={(value) => set("rol", value as UserRole)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="Coordinador">Coordinador</SelectItem>
                  <SelectItem value="Comercial">Comercial</SelectItem>
                  <SelectItem value="Partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">
                Estado <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.estado}
                onValueChange={(value) => set("estado", value as UserStatus)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Activo">Activo</SelectItem>
                  <SelectItem value="Inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {submitError && (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {submitError}
            </p>
          )}

          <DialogFooter className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!requiredOk || submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar perfil
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
