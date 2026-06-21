import type { CollectionType } from "@/lib/mockData";

const MAP: Record<CollectionType, { label: string; cls: string }> = {
  base: { label: "BASE", cls: "badge-muted" },
  user: { label: "USER", cls: "badge-warn" },
  view: { label: "VIEW", cls: "badge-ok" },
};

export default function TypeBadge({ type }: { type: CollectionType }) {
  const m = MAP[type] ?? MAP.base;
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}
