import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AccessDeniedModal } from "@/components/AccessDeniedModal";
import { useAuth } from "@/lib/auth-context";
import { fetchActiveChat } from "@/lib/chat";

type Props = {
  children: ReactNode;
  /** Require `isAdmin: true` on the user's profile. */
  requireAdmin?: boolean;
  /** When set, the signed-in user must own this chat document. */
  chatId?: string;
};

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-mesh px-4 text-center">
      {children}
    </div>
  );
}

/**
 * Route security gate.
 * - Unauthenticated  -> redirect to /login
 * - Foreign chatId   -> AccessDeniedModal, then back to the user's own chat
 * - Non-admin /admin -> AccessDeniedModal, then back to the user's own chat
 */
export function AuthGuard({ children, requireAdmin = false, chatId }: Props) {
  const { user, profile, loading, isAdmin, configured } = useAuth();
  const navigate = useNavigate();
  const [denied, setDenied] = useState(false);
  const [ownershipChecked, setOwnershipChecked] = useState(!chatId);

  // 1. Not signed in -> login
  useEffect(() => {
    if (!configured || loading) return;
    if (!user) navigate({ to: "/login", replace: true });
  }, [configured, loading, user, navigate]);

  // 2. Admin gate
  useEffect(() => {
    if (loading || !user || !profile || !requireAdmin) return;
    if (!isAdmin) setDenied(true);
  }, [loading, user, profile, requireAdmin, isAdmin]);

  // 3. Chat ownership gate
  useEffect(() => {
    if (!chatId || !user) return;
    let cancelled = false;
    setOwnershipChecked(false);
    (async () => {
      try {
        const own = await fetchActiveChat(user.uid);
        if (cancelled) return;
        if (!own || own.id !== chatId) setDenied(true);
      } catch {
        if (!cancelled) setDenied(true);
      } finally {
        if (!cancelled) setOwnershipChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, user]);

  if (!configured) {
    return (
      <FullScreen>
        <div className="panel max-w-md p-8">
          <h1 className="text-lg font-semibold">Firebase not configured</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your Firebase web config in <code className="font-mono">src/lib/firebase-config.ts</code>{" "}
            to enable authentication.
          </p>
        </div>
      </FullScreen>
    );
  }

  if (denied) {
    return (
      <AccessDeniedModal
        onReturnHome={() => {
          setDenied(false);
          navigate({ to: "/chat", replace: true });
        }}
      />
    );
  }

  if (loading || !user || !profile || !ownershipChecked) {
    return (
      <FullScreen>
        <Loader2 className="size-6 animate-spin text-primary" />
      </FullScreen>
    );
  }

  return <>{children}</>;
}
