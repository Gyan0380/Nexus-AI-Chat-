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

          // STEP 1: THE CHATGPT SECRET - USE GEMINI TO EXPAND THE PROMPT FIRST
          const geminiKey = process.env['GEMINI_API_KEY'];
          let megaPrompt = prompt;

          if (geminiKey) {
            const systemInstruction = `You are a master AI image prompt engineer. The user will give you a simple idea for an esports gaming poster (like Free Fire). 
            Your job is to expand it into a highly detailed visual prompt for the FLUX image model.
            CRITICAL: 
            - Describe a highly detailed 3D gaming character (anime/realistic blend) holding a weapon on the left side.
            - Describe a dynamic background: fire, embers, neon lights.
            - Explicitly command the AI to draw typography. Include phrases like "FREE FIRE", "SOLO TOURNAMENT", "REGISTER NOW", and add UI elements like prize pool boxes.
            - Specify a structured graphic design layout.
            Output ONLY the final expanded image generation prompt, nothing else.`;

            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 250 }
              })
            });

            if (res.ok) {
              const data = await res.json() as any;
              const generated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
              if (generated) megaPrompt = generated;
            }
          }

          // STEP 2: SEND THE MEGA PROMPT TO FLUX IMAGE ENGINE
          let width = 1024;
          let height = 1024;
          
          // Changing banner to a slightly taller portrait size for better poster layouts
          if (aspectRatio === "banner") { width = 1024; height = 1280; } 
          if (aspectRatio === "avatar") { width = 768; height = 768; }

          const seed = Math.floor(Math.random() * 9999999);
          const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(megaPrompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}&model=flux`;

          patch['tokens'] = tokens - IMAGE_COST;
          await updateDocument(`Users/${uid}`, patch);

          // We return both the final image and the text Gemini generated so you can see the "secret rewrite"
          return json({ imageUrl, enhancedPrompt: megaPrompt, tokensLeft: tokens - IMAGE_COST });
        } catch (error) {
          return json({ error: (error as Error).message || "Generation failed" }, 500);
        }
      },
    },
  },
});
