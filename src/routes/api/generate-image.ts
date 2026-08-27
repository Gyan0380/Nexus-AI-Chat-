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
            return json({ error: `Requires ${IMAGE_COST} tokens. Not enough tokens!`, code: "NO_TOKENS" }, 429);
          }

          let width = 1024;
          let height = 1024;
          if (aspectRatio === "banner") { width = 1280; height = 720; }
          if (aspectRatio === "avatar") { width = 768; height = 768; }

          const seed = Math.floor(Math.random() * 9999999);
          
          // Force epic gaming style in the background
          const enhancedPrompt = `${prompt}, epic gaming esports style, highly detailed 3d render, cinematic lighting, 8k resolution`;
          
          // Using FLUX model which is incredible at drawing text and game characters!
          const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}&model=flux`;

          patch['tokens'] = tokens - IMAGE_COST;
          await updateDocument(`Users/${uid}`, patch);

          return json({ imageUrl, enhancedPrompt, tokensLeft: tokens - IMAGE_COST });
        } catch (error) {
          return json({ error: (error as Error).message || "Generation failed" }, 500);
        }
      },
    },
  },
});
