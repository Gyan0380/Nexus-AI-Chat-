import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  aspectRatio: z.enum(["square", "banner", "avatar"]).optional().default("square"),
});

const IMAGE_COST = 4; // Cost in tokens

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyIdToken, getDocument, updateDocument, istToday } = await import("@/lib/firebase-admin.server");

        let uid: string;
        try {
          uid = await verifyIdToken(request.headers.get("authorization"));
        } catch {
          return json({ error: "Unauthorized" }, 401);
        }

        const parsed = BodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid request body" }, 400);
        const { prompt, aspectRatio } = parsed.data;

        try {
          // Token balance checks
          const profile = await getDocument(`Users/${uid}`);
          if (!profile) return json({ error: "User profile missing" }, 404);

          let tokens = typeof profile['tokens'] === "number" ? (profile['tokens'] as number) : 0;
          const plan = (profile['plan'] as string) === "premium" ? "premium" : "free";
          const today = istToday();
          const patch: Record<string, unknown> = {};

          if (plan === "free" && profile['last_free_reset'] !== today) {
            tokens = 10;
            patch['tokens'] = tokens;
            patch['last_free_reset'] = today;
          }

          if (tokens < IMAGE_COST) {
            return json({ error: `Image generation requires ${IMAGE_COST} tokens. You don't have enough tokens!`, code: "NO_TOKENS" }, 429);
          }

          // 1. Clarify/Enhance prompt using Groq (or fallback to original)
          let enhancedPrompt = prompt;
          try {
            const groqKey = process.env['GROQ_API_KEY'];
            if (groqKey) {
              const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { authorization: `Bearer ${groqKey}`, "content-type": "application/json" },
                body: JSON.stringify({
                  model: "llama-3.1-70b-versatile",
                  messages: [
                    { role: "system", content: "You are an expert prompt engineer for AI image generators. Take the user's basic idea and rewrite it into a stunning, highly detailed visual prompt optimized for high-end graphic design, logos, or banners. Output ONLY the final image prompt text without any extra chat." },
                    { role: "user", content: prompt }
                  ],
                  temperature: 0.7,
                  max_tokens: 300
                })
              });
              if (res.ok) {
                const data = await res.json() as any;
                enhancedPrompt = data.choices?.[0]?.message?.content?.trim() || prompt;
              }
            }
          } catch (e) {
            console.warn("Prompt enhancement skipped, using raw prompt.");
          }

          // 2. Generate Image URL (Using Pollinations.ai free high-speed generation endpoint)
          // Width & Height based on aspect ratio
          let width = 1024;
          let height = 1024;
          if (aspectRatio === "banner") { width = 1280; height = 720; }
          if (aspectRatio === "avatar") { width = 768; height = 768; }

          const encodedPrompt = encodeURIComponent(enhancedPrompt);
          const imageUrl = `https://pollinations.ai/p/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;

          // Deduct tokens
          patch['tokens'] = tokens - IMAGE_COST;
          await updateDocument(`Users/${uid}`, patch);

          return json({ imageUrl, enhancedPrompt, tokensLeft: tokens - IMAGE_COST });
        } catch (error) {
          console.error("[api/generate-image]", error);
          return json({ error: (error as Error).message || "Image generation failed" }, 500);
        }
      },
    },
  },
});
