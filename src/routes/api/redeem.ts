import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({ key: z.string().min(4).max(120) });

const DEFAULT_TOKENS = 1000;
const DEFAULT_DURATION_DAYS = 30;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/redeem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyIdToken, getDocument, updateDocument, queryCollection } = await import(
          "@/lib/firebase-admin.server"
        );

        let uid: string;
        try {
          uid = await verifyIdToken(request.headers.get("authorization"));
        } catch {
          return json({ error: "Unauthorized" }, 401);
        }

        const parsed = BodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid key" }, 400);
        const key = parsed.data.key.trim().toUpperCase();

        try {
          // Keys may be stored either as the document id or in a `key` field.
          let docId = key;
          let license = await getDocument(`LicenseKeys/${key}`);
          if (!license) {
            const found = await queryCollection("LicenseKeys", "key", key, 1);
            if (found[0]) {
              docId = found[0].id;
              license = found[0].data;
            }
          }

          if (!license) return json({ error: "That key does not exist." }, 404);
          if (license['is_used'] === true) {
            return json({ error: "That key has already been redeemed." }, 409);
          }

          const allocation =
            typeof license['tokens'] === "number" ? (license['tokens'] as number) : DEFAULT_TOKENS;
          const days =
            typeof license['duration_days'] === "number"
              ? (license['duration_days'] as number)
              : DEFAULT_DURATION_DAYS;

          const profile = await getDocument(`Users/${uid}`);
          if (!profile) return json({ error: "User profile missing" }, 404);
          const currentTokens =
            typeof profile['tokens'] === "number" ? (profile['tokens'] as number) : 0;

          // Stack onto an unexpired premium window when one exists.
          const existingExpiry = profile['premium_expires_at'] as string | null;
          const base =
            existingExpiry && new Date(existingExpiry).getTime() > Date.now()
              ? new Date(existingExpiry)
              : new Date();
          const expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

          await updateDocument(`Users/${uid}`, {
            plan: "premium",
            tokens: currentTokens + allocation,
            premium_expires_at: expiresAt.toISOString(),
          });

          await updateDocument(`LicenseKeys/${docId}`, {
            is_used: true,
            used_by: uid,
            used_at: new Date().toISOString(),
          });

          return json({
            success: true,
            plan: "premium",
            tokens: currentTokens + allocation,
            premium_expires_at: expiresAt.toISOString(),
          });
        } catch (error) {
          console.error("[api/redeem]", error);
          return json({ error: "Could not redeem this key right now." }, 500);
        }
      },
    },
  },
});
