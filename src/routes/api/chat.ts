import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  chatId: z.string().min(1).max(8000),
  prompt: z.string().min(1).max(8000),
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
        const {
          verifyIdToken,
          getDocument,
          updateDocument,
          createDocument,
          istToday,
        } = await import("@/lib/firebase-admin.server");
        const { runWorkers, synthesize } = await import("@/lib/ai-workers.server");

        // 1. Authenticate the caller.
        let uid: string;
        try {
          uid = await verifyIdToken(request.headers.get("authorization"));
        } catch {
          return json({ error: "Unauthorized" }, 401);
        }

        // 2. Validate input.
        const parsed = BodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid request body" }, 400);
        const { chatId, prompt } = parsed.data;

        try {
          // 3. Ownership check.
          const chat = await getDocument(`Chats/${chatId}`);
          if (!chat) return json({ error: "Chat not found" }, 404);
          if (chat['uid'] !== uid) return json({ error: "Access denied" }, 403);

          // 4. Token balance check.
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
            return json(
              {
                error: plan === "premium"
                  ? "You are out of tokens."
                  : "Daily free tokens exhausted.",
                code: "NO_TOKENS",
                tokens: 0,
              },
              429,
            );
          }

          // 5. Persist the user's message.
          const now = new Date();
          await createDocument(`Chats/${chatId}/messages`, {
            role: "user",
            content: prompt,
            createdAt: now,
            ts: now.getTime(),
          });

          // 6. ROUTER: Fast Lane vs Heavy Synthesis
          let answer = "";
          let tokenCost = 1;
          
          const lowerPrompt = prompt.trim().toLowerCase();
          const isGreeting = ["hi", "hii", "hiii", "hello", "hey", "ping", "test"].includes(lowerPrompt);

          if (isGreeting || lowerPrompt.length < 10) {
            // 🚀 FAST LANE: Skip workers, ask 1 AI directly for speed
            const key = process.env['GEMINI_API_KEY'];
            if (!key) throw new Error("Missing GEMINI_API_KEY");
            const model = process.env['GEMINI_MODEL'] ?? "gemini-2.5-flash";
            
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  contents: [{ role: "user", parts: [{ text: `The user said: "${prompt}". Reply politely and briefly.` }] }],
                  generationConfig: { temperature: 0.7, maxOutputTokens: 100 },
                }),
              }
            );
            
            if (!res.ok) throw new Error("Fast lane API failed");
            const fastData = (await res.json()) as any;
            answer = fastData.candidates?.[0]?.content?.parts?.[0]?.text || "Hello! How can I help you today?";
          } else {
            // 🐢 HEAVY LANE: 3 Workers + Synthesis
            const drafts = await runWorkers(prompt);
            answer = await synthesize(prompt, drafts);

            // Dynamic pricing only applies to heavy tasks
            if (answer.length > 1500) tokenCost = 2;
            if (answer.length > 3500) tokenCost = 3;
          }

          // 7. Deduct tokens and store the AI answer.
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
