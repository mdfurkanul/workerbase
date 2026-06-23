import {
  AlignLeft,
  Bold,
  Braces,
  Calendar,
  Clock,
  FileText,
  Files,
  Globe,
  Hash,
  KeyRound,
  Link2,
  ListChecks,
  Mail,
  MapPin,
  Phone,
  CircleDot,
  type LucideIcon,
} from "lucide-react";

export type FieldType =
  | "text"
  | "editor"
  | "phone"
  | "url"
  | "email"
  | "integer"
  | "real"
  | "bool"
  | "date"
  | "datetime"
  | "file"
  | "files"
  | "relation"
  | "select"
  | "json"
  | "geo";

export type FieldCategory =
  | "system"
  | "text"
  | "number"
  | "time"
  | "media"
  | "relation"
  | "structured";

export interface FieldTypeMeta {
  value: FieldType;
  label: string;
  Icon: LucideIcon;
  category: FieldCategory;
  description: string;
}

export const FIELD_TYPES: FieldTypeMeta[] = [
  // Text family
  { value: "text", label: "Text", Icon: AlignLeft, category: "text", description: "Short plain text" },
  { value: "editor", label: "Rich editor", Icon: Bold, category: "text", description: "HTML / markdown long-form" },
  { value: "phone", label: "Phone", Icon: Phone, category: "text", description: "E.164 phone number" },
  { value: "url", label: "Website", Icon: Globe, category: "text", description: "Absolute URL" },
  { value: "email", label: "Email", Icon: Mail, category: "text", description: "RFC-5322 email" },

  // Number family
  { value: "integer", label: "Number", Icon: Hash, category: "number", description: "Whole-number value" },
  { value: "real", label: "Decimal", Icon: Hash, category: "number", description: "Floating-point" },

  // Time
  { value: "date", label: "Date", Icon: Calendar, category: "time", description: "Calendar date" },
  { value: "datetime", label: "Date & time", Icon: Clock, category: "time", description: "Timestamp" },

  // Media
  { value: "file", label: "File", Icon: FileText, category: "media", description: "Single file upload" },
  { value: "files", label: "Files", Icon: Files, category: "media", description: "Multiple file uploads" },

  // Relation
  { value: "relation", label: "Relation", Icon: Link2, category: "relation", description: "Link to another collection" },

  // Structured
  { value: "select", label: "Select", Icon: ListChecks, category: "structured", description: "Picklist of choices" },
  { value: "bool", label: "Boolean", Icon: CircleDot, category: "structured", description: "true / false" },
  { value: "json", label: "JSON", Icon: Braces, category: "structured", description: "Nested object / array" },
  { value: "geo", label: "Geolocation", Icon: MapPin, category: "structured", description: "Latitude + longitude" },
];

export const SYSTEM_TYPES: FieldTypeMeta[] = [
  { value: "text", label: "id (auto)", Icon: KeyRound, category: "system", description: "Primary key" },
  { value: "datetime", label: "created (auto)", Icon: Clock, category: "system", description: "Set on insert" },
  { value: "datetime", label: "updated (auto)", Icon: Clock, category: "system", description: "Set on every write" },
];

const BY_VALUE: Partial<Record<FieldType, FieldTypeMeta>> = FIELD_TYPES.reduce(
  (acc, m) => {
    acc[m.value] = m;
    return acc;
  },
  {} as Partial<Record<FieldType, FieldTypeMeta>>,
);

export function fieldTypeMeta(value: FieldType): FieldTypeMeta {
  return BY_VALUE[value] ?? FIELD_TYPES[0]!;
}

export const CATEGORY_LABELS: Record<FieldCategory, string> = {
  system: "System",
  text: "Text",
  number: "Number",
  time: "Date & time",
  media: "Media",
  relation: "Relations",
  structured: "Structured",
};

/** Fields grouped by category, for the "Add field" dropdown. */
export function groupedFieldTypes(): { category: FieldCategory; items: FieldTypeMeta[] }[] {
  const groups: Record<FieldCategory, FieldTypeMeta[]> = {
    system: [],
    text: [],
    number: [],
    time: [],
    media: [],
    relation: [],
    structured: [],
  };
  for (const t of FIELD_TYPES) groups[t.category].push(t);
  return (Object.keys(groups) as FieldCategory[])
    .filter((c) => c !== "system" && groups[c].length > 0)
    .map((c) => ({ category: c, items: groups[c]! }));
}
