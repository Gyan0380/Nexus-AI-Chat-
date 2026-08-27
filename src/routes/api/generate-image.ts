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

          let htmlCode = "";
          const groqKey = process.env['GROQ_API_KEY'];
          
          if (!groqKey) {
            return json({ error: "API Key missing for generation" }, 500);
          }

          // Container dimensions based on type
          const dimensions = aspectRatio === "banner" ? "width: 800px; height: 450px;" : "width: 500px; height: 500px;";

          const systemPrompt = `You are a master web-based graphic designer. The user wants an esports banner, logo, or graphic.
          CRITICAL INSTRUCTIONS:
          1. Generate the design using ONLY raw HTML and inline CSS.
          2. DO NOT wrap the output in markdown (\`\`\`html). Just output the raw code.
          3. The outer root element MUST be exactly: <div style="${dimensions} position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; font-family: sans-serif; box-sizing: border-box; margin: 0; padding: 20px;">
          4. Include rich background gradients, futuristic geometric shapes using absolute positioning, glowing text-shadows, and box-shadows.
          5. Import cool Google Fonts using an inline <style> block inside the div.
          6. The exact text requested by the user MUST be perfectly spelled and prominently displayed. Ensure high contrast.`;

          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { authorization: `Bearer ${groqKey}`, "content-type": "application/json" },
            body: JSON.stringify({
              model: "llama-3.1-70b-versatile",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
              ],
              temperature: 0.6,
              max_tokens: 1500
            })
          });

          if (!res.ok) throw new Error("AI generation failed");
          
          const data = await res.json() as any;
          htmlCode = data.choices?.[0]?.message?.content?.trim() || "";
          
          // Clean up any markdown blocks if the AI hallucinates them
          htmlCode = htmlCode.replace(/```html/gi, "").replace(/```/g, "").trim();

          patch['tokens'] = tokens - IMAGE_COST;
          await updateDocument(`Users/${uid}`, patch);

          return json({ htmlCode, tokensLeft: tokens - IMAGE_COST });
        } catch (error) {
          return json({ error: (error as Error).message || "Generation failed" }, 500);
        }
      },
    },
  },
});
