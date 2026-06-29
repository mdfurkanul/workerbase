import { Pencil, RefreshCw, Settings as Gear, Trash2 } from "lucide-react";
import TypeBadge from "@/components/TypeBadge";

interface CollectionHeaderProps {
  name: string;
  type: "base" | "user" | "view";
  count?: number;
  onReload?: () => void;
  reloading?: boolean;
  onEdit?: () => void;
  onSettings?: () => void;
  onDelete?: () => void;
}

export default function CollectionHeader({
  name,
  type,
  count,
  onReload,
  reloading,
  onEdit,
  onSettings,
  onDelete,
}: CollectionHeaderProps) {
  return (
    <div className="px-6 py-4 hairline-b bg-bg-elev flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="font-mono text-[20px] text-ink truncate">{name}</h1>
          <TypeBadge type={type} />
        </div>
        {typeof count === "number" && (
          <p className="text-[12px] text-ink-muted mt-0.5">
            {count.toLocaleString()} records
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onReload}
          disabled={reloading || !onReload}
          className="btn-icon"
          title="Reload collection"
        >
          <RefreshCw size={15} className={reloading ? "animate-spin" : ""} />
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            className="btn-ghost text-[12px]"
            title="Edit collection schema"
          >
            <Pencil size={13} /> Edit
          </button>
        )}
        {onSettings && (
          <button
            onClick={onSettings}
            className="btn-ghost text-[12px]"
            title="Collection settings & permissions"
          >
            <Gear size={13} /> Settings
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="btn-ghost text-[12px] border-err text-err hover:bg-err-bg"
            title="Delete collection"
          >
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
