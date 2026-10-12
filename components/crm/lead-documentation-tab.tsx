"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleHelp,
  Download,
  FileText,
  Loader2,
  MinusCircle,
  Paperclip,
  Settings2,
  Upload,
  XCircle,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type ConditionalAnswer = "pending" | "yes" | "no";
type RequirementStatus = "complete" | "missing" | "pending" | "not_applicable" | "optional";

type OwnerDocumentation = {
  civilStatus: string;
  maritalRegime: string;
};

type DocumentationState = {
  ownerCount: number;
  owners: OwnerDocumentation[];
  conditions: {
    community: ConditionalAnswer;
    earnestMoney: ConditionalAnswer;
    activeSupplies: ConditionalAnswer;
    mortgage: ConditionalAnswer;
    garage: ConditionalAnswer;
    rented: ConditionalAnswer;
  };
  mortgageCancellationMethod: string;
  keySets: string;
  garageRemotes: string;
};

type DocumentationFile = {
  id: string;
  requirement_key: string;
  file_name: string;
  storage_path: string;
  mime_type?: string | null;
  file_size?: number | null;
  created_at?: string | null;
  uploaded_by?: string | null;
  preview_url?: string;
  is_local?: boolean;
};

type Requirement = {
  key: string;
  label: string;
  description?: string;
  kind: "file" | "text" | "select" | "number";
  required?: boolean;
  condition?: ConditionalAnswer;
  value?: string;
  options?: string[];
  multiple?: boolean;
  onValueChange?: (value: string) => void;
  onValueBlur?: () => void;
};

type Section = {
  key: string;
  title: string;
  requirements: Requirement[];
};

const BUCKET_NAME = "lead-documentation";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const EMPTY_OWNER: OwnerDocumentation = {
  civilStatus: "",
  maritalRegime: "",
};

const DEFAULT_STATE: DocumentationState = {
  ownerCount: 1,
  owners: [{ ...EMPTY_OWNER }],
  conditions: {
    community: "pending",
    earnestMoney: "pending",
    activeSupplies: "pending",
    mortgage: "pending",
    garage: "pending",
    rented: "pending",
  },
  mortgageCancellationMethod: "",
  keySets: "",
  garageRemotes: "",
};

const CONDITION_QUESTIONS: Array<{
  key: keyof DocumentationState["conditions"];
  label: string;
  help: string;
}> = [
  {
    key: "community",
    label: "¿El inmueble pertenece a una comunidad de propietarios?",
    help: "Activa el certificado de deuda cero de la comunidad.",
  },
  {
    key: "earnestMoney",
    label: "¿Se ha firmado un contrato de arras?",
    help: "Activa el contrato y el justificante bancario de las arras.",
  },
  {
    key: "activeSupplies",
    label: "¿El inmueble tiene suministros activos?",
    help: "Activa la carga de los últimos recibos disponibles.",
  },
  {
    key: "mortgage",
    label: "¿Existe una hipoteca sobre el inmueble?",
    help: "Activa la documentación necesaria para su cancelación.",
  },
  {
    key: "garage",
    label: "¿La operación incluye garaje?",
    help: "Activa el registro de mandos de garaje.",
  },
  {
    key: "rented",
    label: "¿El inmueble está actualmente arrendado?",
    help: "Activa la carga del contrato de arrendamiento.",
  },
];

function normalizeState(value: unknown): DocumentationState {
  if (!value || typeof value !== "object") return DEFAULT_STATE;
  const input = value as Partial<DocumentationState>;
  const ownerCount = Math.min(6, Math.max(1, Number(input.ownerCount) || 1));
  const inputOwners = Array.isArray(input.owners) ? input.owners : [];
  const owners = Array.from({ length: ownerCount }, (_, index) => ({
    ...EMPTY_OWNER,
    ...(inputOwners[index] ?? {}),
  }));

  return {
    ...DEFAULT_STATE,
    ...input,
    ownerCount,
    owners,
    conditions: {
      ...DEFAULT_STATE.conditions,
      ...(input.conditions ?? {}),
    },
  };
}

function formatFileSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "documento";
}

function StatusIcon({ status }: { status: RequirementStatus }) {
  const config = {
    complete: { icon: CheckCircle2, className: "text-emerald-600", label: "Completo" },
    missing: { icon: XCircle, className: "text-red-600", label: "Falta" },
    pending: { icon: CircleHelp, className: "text-amber-500", label: "Por confirmar" },
    not_applicable: { icon: MinusCircle, className: "text-slate-400", label: "No aplica" },
    optional: { icon: Paperclip, className: "text-slate-400", label: "Opcional" },
  }[status];
  const Icon = config.icon;

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-[11px] font-medium", config.className)}>
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{config.label}</span>
    </span>
  );
}

function requirementStatus(requirement: Requirement, files: DocumentationFile[]): RequirementStatus {
  if (requirement.condition === "pending") return "pending";
  if (requirement.condition === "no") return "not_applicable";

  const completed =
    requirement.kind === "file"
      ? files.some((file) => file.requirement_key === requirement.key)
      : Boolean(requirement.value?.trim());

  if (completed) return "complete";
  return requirement.required ? "missing" : "optional";
}

export function LeadDocumentationTab({
  leadId,
  currentUserName,
  readOnly = false,
}: {
  leadId: string;
  currentUserName: string;
  readOnly?: boolean;
}) {
  const [state, setState] = useState<DocumentationState>(DEFAULT_STATE);
  const [files, setFiles] = useState<DocumentationFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [configurationStep, setConfigurationStep] = useState(0);
  const [configurationDraft, setConfigurationDraft] =
    useState<DocumentationState>(DEFAULT_STATE);
  const latestState = useRef(state);
  const locked = readOnly;

  useEffect(() => {
    latestState.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;

    async function loadDocumentation() {
      setLoading(true);
      setError(null);
      setSchemaMissing(false);

      const opportunityId = Number(leadId);
      const [caseResponse, filesResponse] = await Promise.all([
        supabase
          .from("opportunity_documentation_cases")
          .select("state")
          .eq("opportunity_id", opportunityId)
          .maybeSingle(),
        supabase
          .from("opportunity_documentation_files")
          .select("*")
          .eq("opportunity_id", opportunityId)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      if (caseResponse.error || filesResponse.error) {
        const message = caseResponse.error?.message || filesResponse.error?.message || "";
        const missing = /does not exist|schema cache|could not find/i.test(message);
        setSchemaMissing(missing);
        setError(
          missing
            ? "Modo de prueba del frontend."
            : `No se pudo cargar la documentación: ${message}`
        );
        setState(DEFAULT_STATE);
        setFiles([]);
      } else {
        setState(normalizeState(caseResponse.data?.state));
        setFiles((filesResponse.data ?? []) as DocumentationFile[]);
      }

      setLoading(false);
    }

    void loadDocumentation();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  async function persistState(nextState: DocumentationState): Promise<boolean> {
    setState(nextState);
    latestState.current = nextState;
    if (readOnly || schemaMissing) return true;

    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("opportunity_documentation_cases")
      .upsert(
        {
          opportunity_id: Number(leadId),
          state: nextState,
          updated_by: currentUserName || "Usuario",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "opportunity_id" }
      );

    if (saveError) {
      setError(`No se pudieron guardar los cambios: ${saveError.message}`);
      setSaving(false);
      return false;
    }
    setSaving(false);
    return true;
  }

  function updateOwner(index: number, key: keyof OwnerDocumentation, value: string, persist = false) {
    const owners = latestState.current.owners.map((owner, ownerIndex) =>
      ownerIndex === index ? { ...owner, [key]: value } : owner
    );
    const nextState = { ...latestState.current, owners };
    setState(nextState);
    latestState.current = nextState;
    if (persist) void persistState(nextState);
  }

  function updateOwnerCivilStatus(index: number, value: string) {
    const owners = latestState.current.owners.map((owner, ownerIndex) =>
      ownerIndex === index
        ? {
            ...owner,
            civilStatus: value,
            maritalRegime: value === "Casado/a" ? owner.maritalRegime : "",
          }
        : owner
    );
    void persistState({ ...latestState.current, owners });
  }

  function updateRootField(
    key: "mortgageCancellationMethod" | "keySets" | "garageRemotes",
    value: string,
    persist = false
  ) {
    const nextState = { ...latestState.current, [key]: value };
    setState(nextState);
    latestState.current = nextState;
    if (persist) void persistState(nextState);
  }

  async function handleUpload(requirementKey: string, file?: File) {
    if (!file || locked) return;
    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      setError("Formato no admitido. Usa PDF, JPG, PNG o WEBP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("El archivo supera el límite de 15 MB.");
      return;
    }

    if (schemaMissing) {
      setFiles((current) => [
        {
          id: `local-${crypto.randomUUID()}`,
          requirement_key: requirementKey,
          file_name: file.name,
          storage_path: "",
          mime_type: file.type,
          file_size: file.size,
          uploaded_by: currentUserName || "Usuario",
          created_at: new Date().toISOString(),
          preview_url: URL.createObjectURL(file),
          is_local: true,
        },
        ...current,
      ]);
      setError(null);
      return;
    }

    setUploadingKey(requirementKey);
    setError(null);
    const storagePath = `${leadId}/${requirementKey}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setError(`No se pudo adjuntar el archivo: ${uploadError.message}`);
      setUploadingKey(null);
      return;
    }

    const { data, error: recordError } = await supabase.rpc(
      "crm_register_document_upload",
      {
        p_opportunity_id: Number(leadId),
        p_data: {
          requirement_key: requirementKey,
          file_name: file.name,
          storage_path: storagePath,
          mime_type: file.type,
          file_size: file.size,
        },
      }
    );

    if (recordError) {
      setError(
        `El archivo se conservó en Storage, pero no se pudo registrar en el expediente: ${recordError.message}`
      );
    } else {
      setFiles((current) => [data as DocumentationFile, ...current]);
    }
    setUploadingKey(null);
  }

  async function handleUploadFiles(requirementKey: string, selectedFiles?: FileList | null) {
    if (!selectedFiles?.length) return;
    for (const file of Array.from(selectedFiles)) {
      await handleUpload(requirementKey, file);
    }
  }

  async function handleDownload(file: DocumentationFile) {
    setError(null);
    if (file.is_local && file.preview_url) {
      window.open(file.preview_url, "_blank", "noopener,noreferrer");
      return;
    }

    const { data: storagePath, error: viewError } = await supabase.rpc(
      "crm_record_document_view",
      { p_file_id: file.id }
    );
    if (viewError || !storagePath) {
      setError(
        `No se pudo abrir el documento: ${viewError?.message || "ruta no disponible"}`
      );
      return;
    }

    const { data, error: signedUrlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(String(storagePath), 60);
    if (signedUrlError) {
      setError(`No se pudo abrir el archivo: ${signedUrlError.message}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const sections = useMemo<Section[]>(() => {
    const ownerSections = state.owners.map((owner, index) => {
      const ownerNumber = index + 1;
      const marriedCondition: ConditionalAnswer = owner.civilStatus === "Casado/a"
        ? "yes"
        : "pending";

      return {
        key: `owner-${ownerNumber}`,
        title: `Datos personales · Propietario ${ownerNumber}`,
        requirements: [
          {
            key: `owner-${ownerNumber}-identity`,
            label: "DNI o pasaporte en vigor",
            kind: "file" as const,
            required: true,
          },
          {
            key: `owner-${ownerNumber}-civil-status`,
            label: "Estado civil",
            kind: "select" as const,
            required: true,
            value: owner.civilStatus,
            options: ["Soltero/a", "Casado/a", "Divorciado/a", "Viudo/a", "Pareja de hecho"],
            onValueChange: (value: string) => updateOwnerCivilStatus(index, value),
          },
          ...(owner.civilStatus && owner.civilStatus !== "Casado/a"
            ? []
            : [
                {
                  key: `owner-${ownerNumber}-marital-regime`,
                  label: "Régimen económico matrimonial",
                  description: "Se solicita únicamente cuando el propietario está casado.",
                  kind: "select" as const,
                  required: true,
                  condition: marriedCondition,
                  value: owner.maritalRegime,
                  options: ["Gananciales", "Separación de bienes", "Participación", "Otro"],
                  onValueChange: (value: string) =>
                    updateOwner(index, "maritalRegime", value, true),
                },
              ]),
          {
            key: `owner-${ownerNumber}-bank-certificate`,
            label: "Certificado de titularidad bancaria",
            description: "Cuenta en la que recibirá el resto del precio.",
            kind: "file" as const,
            required: true,
          },
        ],
      };
    });

    const propertyRequirements: Requirement[] = [
      { key: "property-title", label: "Título de propiedad", kind: "file", required: true },
      { key: "property-simple-note", label: "Nota simple", kind: "file", required: true },
      {
        key: "property-ibi",
        label: "Último recibo del IBI",
        description: "O justificante de estar al corriente de pago.",
        kind: "file",
        required: true,
      },
      {
        key: "property-community-certificate",
        label: "Certificado de deuda cero de la comunidad",
        description: "Se habilita para adjuntar cuando el inmueble pertenece a una comunidad.",
        kind: "file",
        required: true,
        condition: state.conditions.community,
      },
      {
        key: "property-supplies",
        label: "Últimos recibos de suministros",
        description: "Puedes seleccionar y adjuntar varios recibos.",
        kind: "file",
        required: true,
        condition: state.conditions.activeSupplies,
        multiple: true,
      },
    ];

    return [
      ...ownerSections,
      { key: "property", title: "Documentación del inmueble", requirements: propertyRequirements },
      {
        key: "earnest-money",
        title: "Contrato de arras",
        requirements: [
          {
            key: "earnest-money-contract",
            label: "Contrato de arras",
            description: "Adjunta el contrato firmado.",
            kind: "file",
            required: true,
            condition: state.conditions.earnestMoney,
          },
          {
            key: "earnest-money-receipt",
            label: "Justificante de arras",
            description: "Debe mostrar la cuenta de origen y la de destino.",
            kind: "file",
            required: true,
            condition: state.conditions.earnestMoney,
          },
        ],
      },
      ...(state.conditions.mortgage === "no"
        ? []
        : [
            {
              key: "mortgage",
              title: "Hipoteca",
              requirements: [
                {
                  key: "mortgage-debt-certificate",
                  label: "Certificado de deuda pendiente o saldo cero",
                  description: "Solicitarlo aproximadamente una semana antes de la firma.",
                  kind: "file" as const,
                  required: true,
                  condition: state.conditions.mortgage,
                },
                {
                  key: "mortgage-cancellation-method",
                  label: "Forma prevista de cancelación",
                  kind: "select" as const,
                  required: true,
                  condition: state.conditions.mortgage,
                  value: state.mortgageCancellationMethod,
                  options: [
                    "Cancelación previa a la firma",
                    "Cancelación económica en la firma",
                    "Cancelación económica y registral",
                    "Otra",
                  ],
                  onValueChange: (value: string) =>
                    updateRootField("mortgageCancellationMethod", value, true),
                },
                {
                  key: "mortgage-provision",
                  label: "Provisión de fondos para cancelación registral",
                  description: "Adjunta el justificante de la provisión de fondos.",
                  kind: "file" as const,
                  required: true,
                  condition: state.conditions.mortgage,
                },
              ],
            },
          ]),
      {
        key: "others",
        title: "Otros",
        requirements: [
          {
            key: "other-key-sets",
            label: "Número de juegos de llaves",
            kind: "number",
            required: true,
            value: state.keySets,
            onValueChange: (value) => updateRootField("keySets", value),
            onValueBlur: () => void persistState(latestState.current),
          },
          ...(state.conditions.garage === "no"
            ? []
            : [
                {
                  key: "other-garage-remotes",
                  label: "Número de mandos de garaje",
                  kind: "number" as const,
                  required: true,
                  condition: state.conditions.garage,
                  value: state.garageRemotes,
                  onValueChange: (value: string) => updateRootField("garageRemotes", value),
                  onValueBlur: () => void persistState(latestState.current),
                },
              ]),
          ...(state.conditions.rented === "no"
            ? []
            : [
                {
                  key: "other-lease-contract",
                  label: "Contrato de arrendamiento",
                  description: "Adjunta el contrato vigente.",
                  kind: "file" as const,
                  required: true,
                  condition: state.conditions.rented,
                },
              ]),
        ],
      },
    ];
  }, [state]);

  const statuses = useMemo(
    () => sections.flatMap((section) => section.requirements.map((item) => requirementStatus(item, files))),
    [sections, files]
  );
  const summary = {
    complete: statuses.filter((status) => status === "complete").length,
    missing: statuses.filter((status) => status === "missing").length,
    pending: statuses.filter((status) => status === "pending").length,
    notApplicable: statuses.filter((status) => status === "not_applicable").length,
  };
  const applicableTotal = summary.complete + summary.missing;
  const progressPercentage = applicableTotal
    ? Math.round((summary.complete / applicableTotal) * 100)
    : 0;
  const pendingQuestionCount = CONDITION_QUESTIONS.filter(
    (question) => state.conditions[question.key] === "pending"
  ).length;
  const answeredQuestionCount = CONDITION_QUESTIONS.length - pendingQuestionCount;
  const configurationComplete = pendingQuestionCount === 0;
  const configurationPercentage = Math.round(
    (answeredQuestionCount / CONDITION_QUESTIONS.length) * 100
  );

  const configurationSummary = useMemo(() => {
    const labels: Record<keyof DocumentationState["conditions"], string> = {
      community: "Comunidad",
      earnestMoney: "Arras",
      activeSupplies: "Suministros",
      mortgage: "Hipoteca",
      garage: "Garaje",
      rented: "Arrendado",
    };
    const answered = CONDITION_QUESTIONS.flatMap((question) => {
      const value = state.conditions[question.key];
      return value === "pending"
        ? []
        : [`${labels[question.key]}: ${value === "yes" ? "sí" : "no"}`];
    });
    const pendingCount = CONDITION_QUESTIONS.length - answered.length;
    const ownerLabel = `${state.ownerCount} ${state.ownerCount === 1 ? "propietario" : "propietarios"}`;
    return [
      ownerLabel,
      ...answered,
      pendingCount ? `${pendingCount} ${pendingCount === 1 ? "respuesta por confirmar" : "respuestas por confirmar"}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }, [state]);

  function openConfiguration() {
    setConfigurationDraft(normalizeState(state));
    setConfigurationStep(0);
    setConfigurationOpen(true);
  }

  function updateDraftOwnerCount(value: string) {
    const ownerCount = Number(value);
    setConfigurationDraft((current) => ({
      ...current,
      ownerCount,
      owners: Array.from({ length: ownerCount }, (_, index) =>
        current.owners[index] ? { ...current.owners[index] } : { ...EMPTY_OWNER }
      ),
    }));
  }

  function updateDraftCondition(
    key: keyof DocumentationState["conditions"],
    value: ConditionalAnswer
  ) {
    setConfigurationDraft((current) => ({
      ...current,
      conditions: { ...current.conditions, [key]: value },
    }));
  }

  async function saveConfiguration() {
    if (locked) {
      setConfigurationOpen(false);
      return;
    }
    const saved = await persistState(configurationDraft);
    if (saved) setConfigurationOpen(false);
  }

  function renderRequirement(requirement: Requirement) {
    const status = requirementStatus(requirement, files);
    const requirementFiles = files.filter((file) => file.requirement_key === requirement.key);
    const inactive = status === "pending" || status === "not_applicable";

    return (
      <div key={requirement.key} className={cn("rounded-lg border p-3", inactive ? "bg-muted/25" : "bg-background")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("text-sm font-medium", inactive && "text-muted-foreground")}>
              {requirement.label}
              {!requirement.required && <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>}
            </p>
            {requirement.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{requirement.description}</p>
            )}
          </div>
          <StatusIcon status={status} />
        </div>

        {status === "pending" && requirement.kind === "file" && (
          <p className="mt-2 text-xs text-amber-700">
            Responde “Sí” en Configurar documentación para habilitar el archivo.
          </p>
        )}

        {!inactive && requirement.kind === "file" && (
          <div className="mt-3 space-y-2">
            {requirementFiles.map((file) => (
              <div key={file.id} className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-2">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{file.file_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {[formatFileSize(file.file_size), file.uploaded_by].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => void handleDownload(file)}>
                  <Download className="h-3.5 w-3.5" />
                  <span className="sr-only">Abrir archivo</span>
                </Button>
              </div>
            ))}
            {!locked && (
              <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-primary/40 px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/5", uploadingKey === requirement.key && "pointer-events-none opacity-60")}>
                {uploadingKey === requirement.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploadingKey === requirement.key
                  ? "Subiendo..."
                  : requirementFiles.length
                    ? requirement.multiple
                      ? "Adjuntar más archivos"
                      : "Adjuntar otro"
                    : requirement.multiple
                      ? "Adjuntar archivos"
                      : "Adjuntar archivo"}
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  multiple={requirement.multiple}
                  onChange={(event) => {
                    void handleUploadFiles(requirement.key, event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            )}
          </div>
        )}

        {!inactive && requirement.kind === "select" && (
          <Select value={requirement.value || undefined} onValueChange={requirement.onValueChange} disabled={locked}>
            <SelectTrigger className="mt-3 h-9 max-w-sm bg-background text-sm">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {requirement.options?.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {!inactive && (requirement.kind === "text" || requirement.kind === "number") && (
          <Input
            type={requirement.kind === "number" ? "number" : "text"}
            min={requirement.kind === "number" ? 0 : undefined}
            className="mt-3 h-9 max-w-sm bg-background text-sm"
            value={requirement.value ?? ""}
            placeholder={requirement.kind === "number" ? "Indicar cantidad" : "Completar dato"}
            disabled={locked}
            onChange={(event) => requirement.onValueChange?.(event.target.value)}
            onBlur={requirement.onValueBlur}
          />
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando documentación...</div>;
  }

  return (
    <div className="space-y-4">
      <div
        data-testid="documentation-status-card"
        className={cn(
          "rounded-xl border p-4",
          configurationComplete
            ? "border-primary/20 bg-primary/5"
            : "border-amber-200 bg-amber-50/60"
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold">Estado de la documentación</h3>
            {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
          </div>
          <span
            className={cn(
              "shrink-0 text-lg font-semibold",
              configurationComplete ? "text-primary" : "text-amber-700"
            )}
          >
            {configurationComplete
              ? `${progressPercentage}%`
              : `${answeredQuestionCount}/${CONDITION_QUESTIONS.length}`}
          </span>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          {configurationComplete
            ? `${summary.complete} de ${applicableTotal} requisitos completos`
            : `${pendingQuestionCount} ${pendingQuestionCount === 1 ? "pregunta pendiente" : "preguntas pendientes"} para definir qué documentación corresponde`}
        </p>

        <div
          className={cn(
            "mt-3 h-2.5 overflow-hidden rounded-full",
            configurationComplete ? "bg-primary/10" : "bg-amber-200/70"
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              configurationComplete ? "bg-primary" : "bg-amber-500"
            )}
            style={{
              width: `${configurationComplete ? progressPercentage : configurationPercentage}%`,
            }}
          />
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Configuración documental
            </p>
            <p className="mt-1 break-words text-sm leading-5 text-foreground">
              {configurationSummary}
            </p>
            {configurationComplete && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {summary.missing > 0 && (
                  <span className="text-red-600">● {summary.missing} faltantes</span>
                )}
                {summary.pending > 0 && (
                  <span className="text-amber-600">● {summary.pending} datos por confirmar</span>
                )}
                {summary.notApplicable > 0 && (
                  <span className="text-slate-500">● {summary.notApplicable} no aplican</span>
                )}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 bg-background"
            onClick={openConfiguration}
          >
            <Settings2 className="h-4 w-4" />
            {readOnly ? "Ver configuración" : "Configurar documentación"}
          </Button>
        </div>
      </div>

      {error && (
        <div className={cn("rounded-lg border px-3 py-2 text-xs", schemaMissing ? "border-amber-200 bg-amber-50 text-amber-800" : "border-destructive/30 bg-destructive/10 text-destructive")}>
          {schemaMissing
            ? "Modo de prueba: puedes configurar y adjuntar archivos, pero se perderán al refrescar la página."
            : error}
        </div>
      )}

      <Accordion type="multiple" defaultValue={["owner-1"]} className="space-y-3">

        {sections.map((section) => {
          const sectionStatuses = section.requirements.map((item) => requirementStatus(item, files));
          const complete = sectionStatuses.filter((status) => status === "complete").length;
          const missing = sectionStatuses.filter((status) => status === "missing").length;
          const pending = sectionStatuses.filter((status) => status === "pending").length;
          const notApplicable = sectionStatuses.filter((status) => status === "not_applicable").length;

          return (
            <AccordionItem key={section.key} value={section.key} className="rounded-xl border bg-card px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="min-w-0">
                  <p className="font-semibold">{section.title}</p>
                  <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                    {complete} completos{missing ? ` · ${missing} pendientes` : ""}{pending ? ` · ${pending} por confirmar` : ""}{notApplicable ? ` · ${notApplicable} no aplican` : ""}
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="grid gap-3 lg:grid-cols-2">
                {section.requirements.map(renderRequirement)}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <Dialog
        open={configurationOpen}
        onOpenChange={(nextOpen) => {
          if (!saving) setConfigurationOpen(nextOpen);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Configurar documentación</DialogTitle>
            <DialogDescription>
              Responde estas preguntas para mostrar solamente los documentos que correspondan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Paso {configurationStep + 1} de {CONDITION_QUESTIONS.length + 1}</span>
              <span>{Math.round(((configurationStep + 1) / (CONDITION_QUESTIONS.length + 1)) * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${((configurationStep + 1) / (CONDITION_QUESTIONS.length + 1)) * 100}%`,
                }}
              />
            </div>

            {configurationStep === 0 ? (
              <div className="space-y-3">
                <div>
                  <h4 className="text-base font-semibold">¿Cuántos propietarios tiene el inmueble?</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Se creará un bloque de datos y documentos para cada propietario.
                  </p>
                </div>
                <Select
                  value={String(configurationDraft.ownerCount)}
                  onValueChange={updateDraftOwnerCount}
                  disabled={readOnly}
                >
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count} {count === 1 ? "propietario" : "propietarios"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              (() => {
                const question = CONDITION_QUESTIONS[configurationStep - 1];
                const answer = configurationDraft.conditions[question.key];
                return (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-base font-semibold">{question.label}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">{question.help}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ["pending", "Por confirmar"],
                        ["yes", "Sí"],
                        ["no", "No"],
                      ] as Array<[ConditionalAnswer, string]>).map(([value, label]) => (
                        <Button
                          key={value}
                          type="button"
                          variant={answer === value ? "default" : "outline"}
                          className="h-11"
                          disabled={readOnly}
                          onClick={() => updateDraftCondition(question.key, value)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })()
            )}

            {schemaMissing && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Modo de prueba: la configuración se aplicará durante esta sesión, pero todavía no se guardará en Supabase.
              </p>
            )}
            {error && !schemaMissing && (
              <p role="alert" aria-live="polite" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                configurationStep === 0
                  ? setConfigurationOpen(false)
                  : setConfigurationStep((current) => current - 1)
              }
              disabled={saving}
            >
              {configurationStep === 0 ? "Cancelar" : "Anterior"}
            </Button>
            {configurationStep < CONDITION_QUESTIONS.length ? (
              <Button
                type="button"
                onClick={() => setConfigurationStep((current) => current + 1)}
                disabled={saving}
              >
                Siguiente
              </Button>
            ) : (
              <Button type="button" onClick={() => void saveConfiguration()} disabled={saving}>
                {saving
                  ? "Guardando..."
                  : readOnly
                  ? "Cerrar"
                  : schemaMissing
                    ? "Aplicar configuración"
                    : "Guardar configuración"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-[11px] text-muted-foreground">
        Formatos admitidos: PDF, JPG, PNG y WEBP · Máximo 15 MB por archivo · Los documentos se conservan sin opción de eliminación.
      </p>
    </div>
  );
}
