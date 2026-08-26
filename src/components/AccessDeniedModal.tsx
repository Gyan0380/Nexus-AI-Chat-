import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Blocking, non-dismissable overlay shown when a user navigates to a resource
 * they do not own (another user's chat id, or an admin route).
 */
export function AccessDeniedModal({ onReturnHome }: { onReturnHome: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="access-denied-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm"
    >
      <div className="panel w-full max-w-md p-8 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <ShieldAlert className="size-7" />
        </div>
        <h2 id="access-denied-title" className="mt-5 text-xl font-semibold">
          Access Denied
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this resource.
        </p>
        <Button className="mt-6 w-full" onClick={onReturnHome}>
          Return Home
        </Button>
      </div>
    </div>
  );
}
