import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { ArrowLeft, Coins, Crown, KeyRound, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/firebase";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin dashboard — Synthesis AI" },
      { name: "description", content: "Internal admin dashboard for users and license keys." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin dashboard — Synthesis AI" },
      { property: "og:description", content: "Internal admin dashboard for users and license keys." },
    ],
  }),
  component: () => (
    <AuthGuard requireAdmin>
      <AdminPage />
    </AuthGuard>
  ),
});

type Row = { id: string; data: Record<string, unknown> };

function AdminPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<Row[]>([]);
  const [keys, setKeys] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [u, k] = await Promise.all([
          getDocs(query(collection(getDb(), "Users"), limit(100))),
          getDocs(query(collection(getDb(), "LicenseKeys"), limit(100))),
        ]);
        setUsers(u.docs.map((d) => ({ id: d.id, data: d.data() })));
        setKeys(k.docs.map((d) => ({ id: d.id, data: d.data() })));
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const premiumCount = users.filter((u) => u.data['plan'] === "premium").length;
  const unusedKeys = keys.filter((k) => k.data['is_used'] !== true).length;

  return (
    <main className="min-h-screen bg-background bg-mesh px-4 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <Button variant="ghost" onClick={() => navigate({ to: "/chat" })}>
          <ArrowLeft className="size-4" />
          Back to chat
        </Button>

        <h1 className="mt-4 font-display text-3xl font-semibold">Admin dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading ? "Loading data…" : "Live snapshot of users and license keys."}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat icon={<Users className="size-4" />} label="Users" value={users.length} />
          <Stat icon={<Crown className="size-4" />} label="Premium" value={premiumCount} />
          <Stat icon={<KeyRound className="size-4" />} label="Unused keys" value={unusedKeys} />
        </div>

        <section className="panel mt-8 overflow-hidden">
          <h2 className="border-b border-border px-5 py-4 text-sm font-semibold">Users</h2>
          <div className="divide-y divide-border">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{String(u.data['email'] ?? u.id)}</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Coins className="size-3.5 text-premium" />
                  {String(u.data['tokens'] ?? 0)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    u.data['plan'] === "premium"
                      ? "bg-premium/15 text-premium"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {u.data['plan'] === "premium" ? "Premium" : "Free"}
                </span>
                {u.data['isAdmin'] === true ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                    Admin
                  </span>
                ) : null}
              </div>
            ))}
            {!loading && users.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">No users yet.</p>
            ) : null}
          </div>
        </section>

        <section className="panel mt-6 overflow-hidden">
          <h2 className="border-b border-border px-5 py-4 text-sm font-semibold">License keys</h2>
          <div className="divide-y divide-border">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono">
                  {String(k.data['key'] ?? k.id)}
                </span>
                <span className="text-muted-foreground">
                  {String(k.data['tokens'] ?? 1000)} tokens
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    k.data['is_used'] === true
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-primary/15 text-primary"
                  }`}
                >
                  {k.data['is_used'] === true ? "Used" : "Available"}
                </span>
              </div>
            ))}
            {!loading && keys.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                No license keys in the LicenseKeys collection.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="panel p-5">
      <span className="inline-flex items-center gap-2 text-xs tracking-wide text-muted-foreground uppercase">
        {icon}
        {label}
      </span>
      <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}
