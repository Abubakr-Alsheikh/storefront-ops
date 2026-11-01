"use client";

import { Button, EmptyState } from "@/components/ui/primitives";
import { ERROR_MESSAGES, overviewCopy } from "@/lib/data/copy/overview";

/** A screen that crashed while rendering; the shell around it keeps working. */
export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <EmptyState title={ERROR_MESSAGES.internal} action={<Button onClick={reset}>{overviewCopy.retry}</Button>}>
      {overviewCopy.errorHelp}
    </EmptyState>
  );
}
