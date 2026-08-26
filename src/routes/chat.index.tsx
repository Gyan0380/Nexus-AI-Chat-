import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/AuthGuard";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { createChat, fetchActiveChat } from "@/lib/chat";

export const Route = createFileRoute("/chat/")({
  head: () => ({
    meta: [
      { title: "Your chat — Synthesis AI" },
      {
        name: "description",
        content: "Your private Synthesis AI chat: one conversation, answers merged from multiple models.",
      },
      { property: "og:title", content: "Your chat — Synthesis AI" },
      {
        property: "og:description",
        content: "Your private Synthesis AI chat: one conversation, answers merged from multiple models.",
      },
    ],
  }),
  component: () => (
    <AuthGuard>
      <ChatIndex />
    </AuthGuard>
  ),
});

function ChatIndex() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = (await fetchActiveChat(profile.uid)) ?? (await createChat(profile.uid));
        if (!cancelled) {
          navigate({ to: "/chat/$chatId", params: { chatId: existing.id }, replace: true });
        }
      } catch (error) {
        if (!cancelled) {
          toast.error((error as Error).message);
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, navigate]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="flex flex-1 items-center justify-center bg-background bg-mesh p-6 text-center">
        {busy ? (
          <Loader2 className="size-6 animate-spin text-primary" />
        ) : (
          <div>
            <h1 className="font-display text-xl font-semibold">No active chat</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Start one to begin asking questions.
            </p>
            <Button className="mt-5" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
