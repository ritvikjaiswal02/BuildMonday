import { ListPageSkeleton } from "@/components/app/PageSkeletons";

export default function Loading() {
  return <ListPageSkeleton label="runs" filters={false} />;
}
