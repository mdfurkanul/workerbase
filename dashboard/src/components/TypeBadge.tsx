import type { CollectionType } from "@/lib/mockData";
import { collectionTypeMeta, collectionTypeTag } from "@/lib/collectionTypes";

export default function TypeBadge({
  type,
  withIcon = false,
}: {
  type: CollectionType;
  withIcon?: boolean;
}) {
  const m = collectionTypeMeta(type);
  const Icon = m.Icon;
  return (
    <span className={`badge ${m.badgeCls} inline-flex items-center gap-1`}>
      {withIcon && <Icon size={10} />}
      {collectionTypeTag(type)}
    </span>
  );
}
