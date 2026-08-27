import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  chatId: z.string().min(1).max(8000),
  prompt: z.string().min(1).max(8000),
  history: z.array(z.object({
    role: z.string(),
    content: z.string()
  })).optional().default([]),
});

const FREE_DAILY_TOKENS = 10;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyIdToken, getDocument, updateDocument, createDocument, istToday } = await import("@/lib/firebase-admin.server");
        const { runWorkers, synthesize } = await import("@/lib/ai-workers.server");

        let uid: string;
        try {
          uid = await verifyIdToken(request.headers.get("authorization"));
        } catch {
          return json({ error: "Unauthorized" }, 401);
        }

        const parsed = BodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid request body" }, 400);
        const { chatId, prompt, history } = parsed.data;

        try {
          const chat = await getDocument(`Chats/${chatId}`);
          if (!chat) return json({ error: "Chat not found" }, 404);
          if (chat['uid'] !== uid) return json({ error: "Access denied" }, 403);

          const profile = await getDocument(`Users/${uid}`);
          if (!profile) return json({ error: "User profile missing" }, 404);

          let plan = (profile['plan'] as string) === "premium" ? "premium" : "free";
          let tokens = typeof profile['tokens'] === "number" ? (profile['tokens'] as number) : 0;
          const today = istToday();
          const patch: Record<string, unknown> = {};

          const expiry = profile['premium_expires_at'] as string | null;
          if (plan === "premium" && expiry && new Date(expiry).getTime() < Date.now()) {
            plan = "free";
            patch['plan'] = "free";
            patch['premium_expires_at'] = null;
          }

          if (plan === "free" && profile['last_free_reset'] !== today) {
            tokens = FREE_DAILY_TOKENS;
            patch['tokens'] = tokens;
            patch['last_free_reset'] = today;
          }

          if (tokens <= 0) {
            if (Object.keys(patch).length) await updateDocument(`Users/${uid}`, patch);
            return json({ error: plan === "premium" ? "You are out of tokens." : "Daily tokens exhausted.", code: "NO_TOKENS", tokens: 0 }, 429);
          }

          const now = new Date();
          await createDocument(`Chats/${chatId}/messages`, {
            role: "user",
            content: prompt,
            createdAt: now,
            ts: now.getTime(),
          });

          // Run workers with full conversation memory
          const drafts = await runWorkers(prompt, history);
          const answer = await synthesize(prompt, drafts, history);

          let tokenCost = 1;
          if (answer.length > 1500) tokenCost = 2;
          if (answer.length > 3500) tokenCost = 3;

          patch['tokens'] = tokens - tokenCost;
          await updateDocument(`Users/${uid}`, patch);

          const answeredAt = new Date();
          await createDocument(`Chats/${chatId}/messages`, {
            role: "assistant",
            content: answer,
            createdAt: answeredAt,
            ts: answeredAt.getTime(),
          });

          return json({ answer, tokens: tokens - tokenCost, plan, tokensUsed: tokenCost });
        } catch (error) {
          console.error("[api/chat]", error);
          return json({ error: (error as Error).message || "Chat failed" }, 500);
        }
      },
    },
  },
});
