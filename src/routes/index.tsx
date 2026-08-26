import { createFileRoute, Link } from "@tanstack/react-router";
import { Coins, Layers, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Synthesis AI — One answer from three models" },
      {
        name: "description",
        content:
          "Synthesis AI asks three AI models in parallel and returns a single synthesized answer. 10 free tokens daily, premium via license key.",
      },
      { property: "og:title", content: "Synthesis AI — One answer from three models" },
      {
        property: "og:description",
        content:
          "Synthesis AI asks three AI models in parallel and returns a single synthesized answer. 10 free tokens daily, premium via license key.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="min-h-screen bg-background bg-mesh">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="size-5" />
          </span>
          <span className="font-display font-semibold">Synthesis</span>
        </span>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-3xl px-5 pt-16 pb-20 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Layers className="size-3.5 text-primary" />
          Three models in, one answer out
        </p>
        <h1 className="mt-6 text-4xl leading-tight font-semibold sm:text-6xl">
          <span className="text-gradient">Stop guessing</span> which AI is right.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
          Every question is answered in parallel by three AI models, then merged into one
          synthesized response. You only ever see the best version.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/chat">Open your chat</Link>
          </Button>
          <Button size="lg" variant="secondary" asChild>
            <Link to="/signup">Create free account</Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          <Feature
            icon={<Coins className="size-4 text-premium" />}
            title="10 free tokens daily"
            body="Your balance resets every midnight IST. Premium keys add tokens and 30 days of access."
          />
          <Feature
            icon={<Layers className="size-4 text-primary" />}
            title="Multi-model synthesis"
            body="Workers draft in parallel, a synthesizer resolves conflicts into one clean answer."
          />
          <Feature
            icon={<ShieldCheck className="size-4 text-primary" />}
            title="Private by default"
            body="Chats are scoped to your account and verified server-side on every request."
          />
        </div>
      </section>
    </main>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="panel p-5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-secondary">{icon}</span>
      <h2 className="mt-4 text-sm font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
