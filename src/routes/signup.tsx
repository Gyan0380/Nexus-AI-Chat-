import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create an account — Synthesis AI" },
      {
        name: "description",
        content: "Create a free Synthesis AI account and get 10 free tokens every day.",
      },
      { property: "og:title", content: "Create an account — Synthesis AI" },
      {
        property: "og:description",
        content: "Create a free Synthesis AI account and get 10 free tokens every day.",
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { signUpEmail, signInGoogle, user, configured } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/chat", replace: true });
  }, [user, navigate]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    if (!configured) {
      toast.error("Firebase is not configured yet.");
      return;
    }
    setBusy(true);
    try {
      await action();
      navigate({ to: "/chat", replace: true });
    } catch (error) {
      toast.error((error as Error).message.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background bg-mesh px-4 py-12">
      <div className="panel w-full max-w-md p-8">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="size-5" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Free plan includes 10 tokens per day.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length < 6) {
              toast.error("Password must be at least 6 characters.");
              return;
            }
            void run(() => signUpEmail(email, password));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={() => void run(signInGoogle)}
        >
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
