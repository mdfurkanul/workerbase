import { Database, Eye, ShieldCheck, type LucideIcon } from "lucide-react";
import type { CollectionType } from "@/lib/types";

export interface CollectionTypeMeta {
  /** Storage value (matches backend `CollectionType`). */
  value: CollectionType;
  /** Display label. */
  label: string;
  /** Short description for dropdowns. */
  description: string;
  /** Sidebar / card icon. */
  Icon: LucideIcon;
  /** Badge class — matches tokens defined in index.css. */
  badgeCls: string;
}

export const COLLECTION_TYPES: CollectionTypeMeta[] = [
  {
    value: "base",
    label: "Base Collection",
    description: "Custom schema with your own columns",
    Icon: Database,
    badgeCls: "badge-muted",
  },
  {
    value: "user",
    label: "Auth Collection",
    description: "Authentication pool — login, sessions, hashing",
    Icon: ShieldCheck,
    badgeCls: "badge-warn",
  },
  {
    value: "view",
    label: "View Collection",
    description: "Virtual table backed by a SQL query",
    Icon: Eye,
    badgeCls: "badge-ok",
  },
];

const BY_VALUE: Record<CollectionType, CollectionTypeMeta> = COLLECTION_TYPES.reduce(
  (acc, m) => {
    acc[m.value] = m;
    return acc;
  },
  {} as Record<CollectionType, CollectionTypeMeta>,
);

export function collectionTypeMeta(value: CollectionType): CollectionTypeMeta {
  return BY_VALUE[value] ?? COLLECTION_TYPES[0]!;
}

/** Short uppercase tag for badges (BASE / AUTH / VIEW). */
export function collectionTypeTag(value: CollectionType): string {
  if (value === "user") return "AUTH";
  return value.toUpperCase();
}
