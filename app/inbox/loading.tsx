import { ListPageSkeleton } from "@/components/app/PageSkeletons";

export default function Loading() {
  return <ListPageSkeleton label="inbox" rows={10} />;
}
