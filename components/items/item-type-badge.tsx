import { Badge } from "@/components/ui/badge";
import { itemTypeMeta, type ItemType } from "@/lib/mock/data";

export function ItemTypeBadge({ type }: { type: ItemType }) {
  const meta = itemTypeMeta[type];
  return (
    <Badge color={meta.color} bg={meta.bg}>
      {type} — {meta.label}
    </Badge>
  );
}
