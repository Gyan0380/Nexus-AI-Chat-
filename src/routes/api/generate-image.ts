import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  aspectRatio: z.enum(["square", "banner", "avatar"]).optional().default("square"),
});

const IMAGE_COST = 4;

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
            return json({ error: `Image generation requires ${IMAGE_COST} tokens. Not enough tokens!`, code: "NO_TOKENS" }, 429);
          }

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
                    { role: "system", content: "You are an expert prompt engineer. Take the user's idea and rewrite it into a vivid, high-resolution graphic design prompt for esports banners or logos. Output ONLY the final prompt text." },
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
            console.warn("Prompt enhancement skipped.");
          }

          // Use direct stable image generation source
          const seed = Math.floor(Math.random() * 999999);
          let imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
          if (aspectRatio === "banner") {
            imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1280&height=720&nologo=true&seed=${seed}`;
          }

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
