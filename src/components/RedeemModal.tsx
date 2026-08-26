import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";

export function RedeemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { getIdToken } = useAuth();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: key.trim() }),
      });
      const data = (await res.json()) as { error?: string; tokens?: number };
      if (!res.ok) throw new Error(data.error ?? "Redemption failed");
      toast.success(`Premium unlocked — ${data.tokens} tokens available.`);
      setKey("");
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="panel w-full max-w-md p-7 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-premium/15 text-premium">
            <KeyRound className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Redeem Premium Key</h2>
            <p className="text-xs text-muted-foreground">30 days of premium + bonus tokens.</p>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <Label htmlFor="license-key">License key</Label>
          <Input
            id="license-key"
            autoFocus
            placeholder="XXXX-XXXX-XXXX"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="font-mono tracking-widest uppercase"
          />
        </div>

        <div className="mt-6 flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={busy || !key.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Redeem"}
          </Button>
        </div>
      </form>
    </div>
  );
}
