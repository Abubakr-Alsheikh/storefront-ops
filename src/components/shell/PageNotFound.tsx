import Link from "next/link";
import { EmptyState } from "@/components/ui/primitives";
import { notFoundCopy } from "@/lib/data/copy/shell";

export function PageNotFound() {
  return (
    <EmptyState
      title={notFoundCopy.title}
      action={<Link href="/" className="rounded text-sm font-medium text-accent hover:underline">{notFoundCopy.back}</Link>}
    >
      {notFoundCopy.help}
    </EmptyState>
  );
}
