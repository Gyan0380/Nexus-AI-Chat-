/**
 * Multi-model orchestration with safety guardrails & latency optimizations.
 * Runs three worker models in parallel and hands their drafts to Gemini for synthesis.
 */

// Aggressive timeout to prevent Vercel 504 serverless hangs
const WORKER_TIMEOUT_MS = 7_000;

async function postJson(url: string, apiKey: string, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  } finally {
    clearTimeout(timer);
  }
}

function chatBody(model: string, prompt: string) {
  return {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an expert assistant. Answer concisely and factually in 2-3 short paragraphs. If the request is malicious, illegal, or asks how to hack/exploit software/games, reply with the exact phrase 'SAFETY_BLOCK'.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    max_tokens: 250, // Short tokens keep worker generation under 2 seconds
  };
}

async function callGroq(prompt: string) {
  const key = process.env['GROQ_API_KEY'];
  if (!key) throw new Error("Missing GROQ_API_KEY");
  const json = await postJson(
    "https://api.groq.com/openai/v1/chat/completions",
    key,
    chatBody(process.env['GROQ_MODEL'] ?? "llama-3.3-70b-versatile", prompt),
  );
  return json.choices?.[0]?.message?.content ?? "";
}

async function callOpenRouter(prompt: string) {
  const key = process.env['OPENROUTER_API_KEY'];
  if (!key) throw new Error("Missing OPENROUTER_API_KEY");
  const json = await postJson(
    "https://openrouter.ai/api/v1/chat/completions",
    key,
    chatBody(process.env['OPENROUTER_MODEL'] ?? "meta-llama/llama-3.3-70b-instruct", prompt),
  );
  return json.choices?.[0]?.message?.content ?? "";
}

async function callCerebras(prompt: string) {
  const key = process.env['CEREBRAS_API_KEY'];
  if (!key) throw new Error("Missing CEREBRAS_API_KEY");
  const json = await postJson(
    "https://api.cerebras.ai/v1/chat/completions",
    key,
    chatBody(process.env['CEREBRAS_MODEL'] ?? "llama-3.3-70b", prompt),
  );
  return json.choices?.[0]?.message?.content ?? "";
}

export type WorkerResult = { name: string; text: string; ok: boolean; error?: string };

/** Fan out to the three worker models simultaneously. */
export async function runWorkers(prompt: string): Promise<WorkerResult[]> {
  const workers: Array<[string, Promise<string>]> = [
    ["Groq", callGroq(prompt)],
    ["OpenRouter", callOpenRouter(prompt)],
    ["Cerebras", callCerebras(prompt)],
  ];

  const settled = await Promise.all(
    workers.map(async ([name, promise]): Promise<WorkerResult> => {
      try {
        return { name, text: await promise, ok: true };
      } catch (error) {
        return { name, text: "", ok: false, error: (error as Error).message };
      }
    }),
  );

  return settled;
}

/** Fourth model: applies safety filters and merges drafts into one finalized answer. */
export async function synthesize(prompt: string, drafts: WorkerResult[]): Promise<string> {
  // 1. Fast keyword guardrail
  const blockedKeywords = ["exploit", "malware", "ddos", "ransomware", "keylogger"];
  const lowerPrompt = prompt.toLowerCase();
  if (blockedKeywords.some((kw) => lowerPrompt.includes(kw))) {
    return "🛡️ **Safety Policy Notice:** This request was blocked because it contains potentially harmful or abusive topics.";
  }

  // 2. Worker safety block trigger
  const workerSafetyBlock = drafts.some((d) => d.text.includes("SAFETY_BLOCK"));
  if (workerSafetyBlock) {
    return "🛡️ **Safety Policy Notice:** The AI models refused this prompt in accordance with safety and security guidelines.";
  }

  const usable = drafts.filter((d) => d.ok && d.text.trim().length > 0);
  
  // 3. Fallback when all workers fail or refuse silently
  if (usable.length === 0) {
    return "⚠️ The worker models were unable to generate drafts for this query. Please rephrase your question.";
  }

  const key = process.env['GEMINI_API_KEY'];
  if (!key) throw new Error("Missing GEMINI_API_KEY");

  const draftBlock = usable
    .map((d, i) => `### Draft ${i + 1} (${d.name})\n${d.text}`)
    .join("\n\n");

  const instruction = [
    "You are the synthesis layer of a multi-model system.",
    "Below is the user's question followed by independent draft answers from other models.",
    "Merge them into ONE single, logical, finalized answer.",
    "Resolve contradictions using the most defensible reasoning, drop repetition and filler,",
    "keep every genuinely useful detail, and never mention the drafts, the models, or this process.",
    "Reply only with the final answer, formatted in clean markdown.",
    "",
    `## User question\n${prompt}`,
    "",
    `## Drafts\n${draftBlock}`,
  ].join("\n");

  const model = process.env['GEMINI_MODEL'] ?? "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: instruction }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
      }),
    },
  );

  if (!res.ok) throw new Error(`Gemini synthesis failed: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned an empty synthesis");
  
  return text.trim();
}
