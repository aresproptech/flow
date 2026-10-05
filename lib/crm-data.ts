// Shared mock data and types for the CRM

export type LeadStatus =
  | "activa"
  | "caliente"
  | "desestimada";
export type LeadPhase =
  | "identificada"
  | "cualificada"
  | "valorada"
  | "encargo";

export interface Observacion {
  id: string;
  date: string; // ISO date string
  text: string;
}

export interface Lead {
  id: string;
  ownerName: string;
  address: string;
  distrito: string;
  municipio: string;
  provincia: string;
  cp: string;
  valor: string;
  phone: string;
  source: string;
  sourceId?: number | null;
  domainId?: number | null;
  occupancy?: string | null;
  medio?: string;
  enVenta?: string;
  phase: LeadPhase;
  status: LeadStatus;
  fechaNoticia: string;
  fechaContacto: string;
  fechaValoracion: string;
  hora: string;
  planner?: string;
  plannerId?: number | null;
  owner: string;
  ownerId?: number | null;
  buyer?: string;
  buyerId?: number | null;
  createdAt: string;
  assignedUser: string;
  propertyAddress: string;
  notes?: string;
  observaciones: Observacion[];
}

export const PHASE_LABELS: Record<LeadPhase, string> = {
  identificada: "Identificada",
  cualificada: "Cualificada",
  valorada: "Valorada",
  encargo: "Encargo",
};

export const PHASE_COLORS: Record<LeadPhase, string> = {
  identificada: "#94a3b8",
  cualificada: "#60a5fa",
  valorada: "#a78bfa",
  encargo: "#10b981",
};

export const SOURCE_OPTIONS = [
  "Idealista",
  "Papelito",
  "Referido",
  "Personal",
  "Tasar-Online",
  "TasaTuCasa",
  "Tasar-BUE",
  "Venta-Online",
  "Venta-Alquilada",
  "Visita",
  "Zona",
  "Oficina",
  "Portero",
];  

export const PHASE_OPTIONS: { value: LeadPhase; label: string }[] = [
  { value: "identificada", label: "Identificada" },
  { value: "cualificada", label: "Cualificada" },
  { value: "valorada", label: "Valorada" },
  { value: "encargo", label: "Encargo" },
];

export const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "activa", label: "Activa" },
  { value: "caliente", label: "Caliente" },
  { value: "desestimada", label: "Desestimada" },
];

export const EN_VENTA_OPTIONS = [
  { value: "SI", label: "SI" },
  { value: "NO", label: "NO" },
] as const;

export function normalizeEnVenta(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase();
  return normalized === "SI" || normalized === "NO" ? normalized : "";
}

export function normalizeOpportunityText(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  return trimmed.toLowerCase().replace(
    /(^|[^\p{L}\p{N}])(\p{L})/gu,
    (_match, boundary: string, letter: string) => `${boundary}${letter.toUpperCase()}`
  );
}

export const AGENT_OPTIONS = [
  "Abdel",
  "Katy",
  "Katdel",
  "Adri",
  "Beto",
  "Gonza",
  "Guille",
  "Inma",
  "Jorge S.",
  "Juanje",
  "Sergio",
];

export const MOCK_LEADS: Lead[] = [
  {
    id: "n1",
    ownerName: "Carlos Sánchez Ruiz",
    address: "C/ Gran Vía 45",
    distrito: "Centro",
    municipio: "Madrid",
    provincia: "Madrid",
    cp: "28013",
    valor: "380.000 €",
    phone: "+34 612 345 678",
    status: "activa",
    source: "Referido",
    phase: "identificada",
    fechaNoticia: "2025-03-01",
    fechaContacto: "2025-03-03",
    fechaValoracion: "",
    hora: "10:00",
    owner: "Ana García",
    createdAt: "2025-03-01",
    assignedUser: "Ana García",
    propertyAddress: "C/ Gran Vía 45, Madrid",
    notes: "Interesado en vender en los próximos 6 meses.",
    observaciones: [
      { id: "o1", date: "2025-03-01", text: "Primera toma de contacto por teléfono. Muestra interés." },
      { id: "o2", date: "2025-03-03", text: "Confirmada visita presencial para el 10 de marzo." },
    ],
  },
  {
    id: "n2",
    ownerName: "Isabel Mora López",
    address: "Av. Diagonal 211",
    distrito: "Eixample",
    municipio: "Barcelona",
    provincia: "Barcelona",
    cp: "08007",
    valor: "520.000 €",
    phone: "+34 699 871 234",
    status: "activa",
    source: "Web",
    phase: "identificada",
    fechaNoticia: "2025-03-03",
    fechaContacto: "2025-03-04",
    fechaValoracion: "",
    hora: "11:30",
    owner: "Pedro Ruiz",
    createdAt: "2025-03-03",
    assignedUser: "Pedro Ruiz",
    propertyAddress: "Av. Diagonal 211, Barcelona",
    observaciones: [],
  },
  {
    id: "n3",
    ownerName: "Tomás Vega Nieto",
    address: "P.º de la Castellana 100",
    distrito: "Salamanca",
    municipio: "Madrid",
    provincia: "Madrid",
    cp: "28046",
    valor: "610.000 €",
    phone: "+34 677 564 321",
    status: "desestimada",
    source: "Portales",
    phase: "identificada",
    fechaNoticia: "2025-02-20",
    fechaContacto: "2025-02-22",
    fechaValoracion: "",
    hora: "09:00",
    owner: "Ana García",
    createdAt: "2025-02-20",
    assignedUser: "Ana García",
    propertyAddress: "P.º de la Castellana 100, Madrid",
    notes: "No quiere vender por el momento.",
    observaciones: [
      { id: "o1", date: "2025-02-22", text: "Llamada realizada. El propietario no tiene urgencia de venta." },
    ],
  },
  {
    id: "c1",
    ownerName: "María Fernández Gil",
    address: "C/ Serrano 12",
    distrito: "Salamanca",
    municipio: "Madrid",
    provincia: "Madrid",
    cp: "28001",
    valor: "450.000 €",
    phone: "+34 645 123 456",
    status: "caliente",
    source: "LinkedIn",
    phase: "cualificada",
    fechaNoticia: "2025-03-05",
    fechaContacto: "2025-03-06",
    fechaValoracion: "2025-03-15",
    hora: "12:00",
    owner: "Laura Soto",
    createdAt: "2025-03-05",
    assignedUser: "Laura Soto",
    propertyAddress: "C/ Serrano 12, Madrid",
    notes: "Visita programada para el 15 de marzo.",
    observaciones: [
      { id: "o1", date: "2025-03-05", text: "Contacto inicial vía LinkedIn. Respuesta positiva." },
      { id: "o2", date: "2025-03-06", text: "Visita agendada para el 15/03 a las 12:00." },
    ],
  },
  {
    id: "c2",
    ownerName: "Javier Ortega Blanco",
    address: "Rambla Catalunya 55",
    distrito: "Eixample",
    municipio: "Barcelona",
    provincia: "Barcelona",
    cp: "08007",
    valor: "390.000 €",
    phone: "+34 610 987 654",
    status: "activa",
    source: "Referido",
    phase: "cualificada",
    fechaNoticia: "2025-03-06",
    fechaContacto: "2025-03-07",
    fechaValoracion: "",
    hora: "16:00",
    owner: "Pedro Ruiz",
    createdAt: "2025-03-06",
    assignedUser: "Pedro Ruiz",
    propertyAddress: "Rambla Catalunya 55, Barcelona",
    observaciones: [],
  },
  {
    id: "v1",
    ownerName: "Laura Jiménez Soler",
    address: "C/ Alcalá 200",
    distrito: "Retiro",
    municipio: "Madrid",
    provincia: "Madrid",
    cp: "28028",
    valor: "420.000 €",
    phone: "+34 655 234 789",
    status: "caliente",
    source: "Portales",
    phase: "valorada",
    fechaNoticia: "2025-02-28",
    fechaContacto: "2025-03-01",
    fechaValoracion: "2025-03-08",
    hora: "10:30",
    owner: "Laura Soto",
    createdAt: "2025-02-28",
    assignedUser: "Laura Soto",
    propertyAddress: "C/ Alcalá 200, Madrid",
    notes: "Valoración enviada. Precio orientativo 420.000 €.",
    observaciones: [
      { id: "o1", date: "2025-03-01", text: "Visita realizada. Piso en buen estado." },
      { id: "o2", date: "2025-03-08", text: "Informe de valoración enviado por email." },
    ],
  },
  {
    id: "v2",
    ownerName: "Antonio Reyes Cano",
    address: "Av. Meridiana 340",
    distrito: "Nou Barris",
    municipio: "Barcelona",
    provincia: "Barcelona",
    cp: "08030",
    valor: "275.000 €",
    phone: "+34 633 456 789",
    status: "activa",
    source: "Web",
    phase: "valorada",
    fechaNoticia: "2025-02-25",
    fechaContacto: "2025-02-26",
    fechaValoracion: "2025-03-04",
    hora: "11:00",
    owner: "Ana García",
    createdAt: "2025-02-25",
    assignedUser: "Ana García",
    propertyAddress: "Av. Meridiana 340, Barcelona",
    observaciones: [],
  },
  {
    id: "v3",
    ownerName: "Sofía Delgado Pons",
    address: "C/ Velázquez 88",
    distrito: "Salamanca",
    municipio: "Madrid",
    provincia: "Madrid",
    cp: "28006",
    valor: "550.000 €",
    phone: "+34 601 321 654",
    status: "activa",
    source: "Referido",
    phase: "valorada",
    fechaNoticia: "2025-02-22",
    fechaContacto: "2025-02-24",
    fechaValoracion: "2025-03-02",
    hora: "17:00",
    owner: "Pedro Ruiz",
    createdAt: "2025-02-22",
    assignedUser: "Pedro Ruiz",
    propertyAddress: "C/ Velázquez 88, Madrid",
    observaciones: [],
  },
  {
    id: "q1",
    ownerName: "Pablo Torres Muñoz",
    address: "C/ Goya 34",
    distrito: "Salamanca",
    municipio: "Madrid",
    provincia: "Madrid",
    cp: "28001",
    valor: "480.000 €",
    phone: "+34 678 432 100",
    status: "caliente",
    source: "Referido",
    phase: "cualificada",
    fechaNoticia: "2025-03-08",
    fechaContacto: "2025-03-09",
    fechaValoracion: "2025-03-12",
    hora: "10:00",
    owner: "Laura Soto",
    createdAt: "2025-03-08",
    assignedUser: "Laura Soto",
    propertyAddress: "C/ Goya 34, Madrid",
    notes: "Pendiente de firma del encargo.",
    observaciones: [
      { id: "o1", date: "2025-03-09", text: "Reunión con el propietario. Acepta precio orientativo." },
    ],
  },
  {
    id: "q2",
    ownerName: "Elena Castro Vidal",
    address: "Gran Via de les Corts 701",
    distrito: "Les Corts",
    municipio: "Barcelona",
    provincia: "Barcelona",
    cp: "08028",
    valor: "360.000 €",
    phone: "+34 644 876 543",
    status: "activa",
    source: "Web",
    phase: "cualificada",
    fechaNoticia: "2025-03-09",
    fechaContacto: "2025-03-10",
    fechaValoracion: "",
    hora: "15:00",
    owner: "Ana García",
    createdAt: "2025-03-09",
    assignedUser: "Ana García",
    propertyAddress: "Gran Via de les Corts 701, Barcelona",
    observaciones: [],
  },
  {
    id: "e1",
    ownerName: "Roberto Navarro Lara",
    address: "C/ Fuencarral 120",
    distrito: "Centro",
    municipio: "Madrid",
    provincia: "Madrid",
    cp: "28004",
    valor: "320.000 €",
    phone: "+34 690 543 210",
    status: "caliente",
    source: "Portales",
    phase: "encargo",
    fechaNoticia: "2025-02-15",
    fechaContacto: "2025-02-16",
    fechaValoracion: "2025-02-20",
    hora: "09:30",
    owner: "Pedro Ruiz",
    createdAt: "2025-02-15",
    assignedUser: "Pedro Ruiz",
    propertyAddress: "C/ Fuencarral 120, Madrid",
    notes: "Encargo exclusivo firmado. Publicado en portales.",
    observaciones: [
      { id: "o1", date: "2025-02-20", text: "Encargo exclusivo firmado." },
      { id: "o2", date: "2025-02-22", text: "Publicado en Idealista y Fotocasa." },
    ],
  },
  {
    id: "e2",
    ownerName: "Cristina Molina Pérez",
    address: "Av. Tibidabo 8",
    distrito: "Sarrià-Sant Gervasi",
    municipio: "Barcelona",
    provincia: "Barcelona",
    cp: "08022",
    valor: "890.000 €",
    phone: "+34 617 890 234",
    status: "caliente",
    source: "LinkedIn",
    phase: "encargo",
    fechaNoticia: "2025-02-18",
    fechaContacto: "2025-02-19",
    fechaValoracion: "2025-02-25",
    hora: "13:00",
    owner: "Laura Soto",
    createdAt: "2025-02-18",
    assignedUser: "Laura Soto",
    propertyAddress: "Av. Tibidabo 8, Barcelona",
    observaciones: [],
  },
  {
    id: "e3",
    ownerName: "Andrés Serrano Roca",
    address: "Paseo Recoletos 10",
    distrito: "Retiro",
    municipio: "Madrid",
    provincia: "Madrid",
    cp: "28001",
    valor: "720.000 €",
    phone: "+34 666 111 222",
    status: "activa",
    source: "Referido",
    phase: "encargo",
    fechaNoticia: "2025-02-10",
    fechaContacto: "2025-02-11",
    fechaValoracion: "2025-02-18",
    hora: "10:00",
    owner: "Ana García",
    createdAt: "2025-02-10",
    assignedUser: "Ana García",
    propertyAddress: "Paseo Recoletos 10, Madrid",
    observaciones: [],
  },
  {
    id: "s1",
    ownerName: "Nuria Ramírez Font",
    address: "C/ Conde Peñalver 5",
    distrito: "Salamanca",
    municipio: "Madrid",
    provincia: "Madrid",
    cp: "28006",
    valor: "495.000 €",
    phone: "+34 654 678 901",
    status: "caliente",
    source: "Referido",
    phase: "encargo",
    fechaNoticia: "2025-01-30",
    fechaContacto: "2025-01-31",
    fechaValoracion: "2025-02-05",
    hora: "11:00",
    owner: "Pedro Ruiz",
    createdAt: "2025-01-30",
    assignedUser: "Pedro Ruiz",
    propertyAddress: "C/ Conde Peñalver 5, Madrid",
    notes: "3 ofertas recibidas. Negociación en curso.",
    observaciones: [
      { id: "o1", date: "2025-02-10", text: "Primera oferta recibida: 470.000 €. Rechazada por el propietario." },
      { id: "o2", date: "2025-02-20", text: "Segunda oferta: 485.000 €. En estudio." },
      { id: "o3", date: "2025-03-01", text: "Tercera oferta: 492.000 €. Negociación activa." },
    ],
  },
  {
    id: "s2",
    ownerName: "Marcos Gil Aranda",
    address: "Av. Sarrià 90",
    distrito: "Sarrià-Sant Gervasi",
    municipio: "Barcelona",
    provincia: "Barcelona",
    cp: "08017",
    valor: "640.000 €",
    phone: "+34 629 345 012",
    status: "caliente",
    source: "Web",
    phase: "encargo",
    fechaNoticia: "2025-02-02",
    fechaContacto: "2025-02-03",
    fechaValoracion: "2025-02-10",
    hora: "16:30",
    owner: "Laura Soto",
    createdAt: "2025-02-02",
    assignedUser: "Laura Soto",
    propertyAddress: "Av. Sarrià 90, Barcelona",
    observaciones: [],
  },
];
