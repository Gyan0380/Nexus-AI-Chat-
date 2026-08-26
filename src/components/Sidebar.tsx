import { useNavigate } from "@tanstack/react-router";
import {
  Coins,
  Crown,
  KeyRound,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { RedeemModal } from "@/components/RedeemModal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { createChat, deleteChat, subscribeActiveChat, type ChatDoc } from "@/lib/chat";

export function Sidebar({ activeChatId }: { activeChatId?: string }) {
  const { profile, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [chat, setChat] = useState<ChatDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    return subscribeActiveChat(profile.uid, setChat);
  }, [profile]);

  const isPremium = profile?.plan === "premium";

  async function handleNewChat() {
    if (!profile || busy) return;
    // Hard limit: exactly one active chat per user.
    if (chat) {
      toast.error("You already have an active chat. Delete it to start a new one.");
      navigate({ to: "/chat/$chatId", params: { chatId: chat.id } });
      return;
    }
    setBusy(true);
    try {
      const created = await createChat(profile.uid);
      navigate({ to: "/chat/$chatId", params: { chatId: created.id } });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!chat || busy) return;
    setBusy(true);
    try {
      await deleteChat(chat.id);
      toast.success("Chat deleted.");
      navigate({ to: "/chat", replace: true });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-5 border-b border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:h-screen md:w-72 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="size-5" />
        </span>
        <div>
          <p className="font-display text-base leading-tight font-semibold">Synthesis</p>
          <p className="text-xs text-muted-foreground">Multi-model answers</p>
        </div>
      </div>

      {/* Plan + balance */}
      <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">Plan</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              isPremium
                ? "bg-premium/15 text-premium"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {isPremium ? <Crown className="size-3" /> : null}
            {isPremium ? "Premium" : "Free"}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Coins className="size-5 text-premium" />
          <span className="font-display text-2xl font-semibold">{profile?.tokens ?? 0}</span>
          <span className="text-xs text-muted-foreground">tokens left</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {isPremium
            ? profile?.premium_expires_at
              ? `Premium until ${new Date(profile.premium_expires_at).toLocaleDateString()}`
              : "Premium active"
            : "Free plan resets to 10 tokens daily (midnight IST)."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={handleNewChat} disabled={busy}>
          <Plus className="size-4" />
          New Chat
        </Button>
        <Button variant="secondary" onClick={() => setRedeemOpen(true)}>
          <KeyRound className="size-4" />
          Redeem Premium Key
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">Your chat</p>
        {chat ? (
          <div
            className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${
              activeChatId === chat.id
                ? "border-primary/50 bg-primary/10"
                : "border-sidebar-border"
            }`}
          >
            <button
              className="flex-1 truncate text-left"
              onClick={() => navigate({ to: "/chat/$chatId", params: { chatId: chat.id } })}
            >
              {chat.title}
            </button>
            <button
              aria-label="Delete chat"
              className="text-muted-foreground transition-colors hover:text-destructive"
              onClick={handleDelete}
              disabled={busy}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No chat yet — create one.</p>
        )}
      </div>

      <div className="space-y-2 border-t border-sidebar-border pt-3">
        <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
        {isAdmin ? (
          <Button variant="ghost" className="w-full justify-start" onClick={() => navigate({ to: "/admin" })}>
            <ShieldCheck className="size-4" />
            Admin dashboard
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={async () => {
            await logout();
            navigate({ to: "/login", replace: true });
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>

      <RedeemModal open={redeemOpen} onClose={() => setRedeemOpen(false)} />
    </aside>
  );
}
