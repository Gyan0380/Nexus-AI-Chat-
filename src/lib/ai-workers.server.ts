/**
 * Multi-model orchestration with safety guardrails & latency optimizations.
 * Runs three worker models in parallel and hands their drafts to Gemini for synthesis.
 */

const WORKER_TIMEOUT_MS = 25_000;

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
          "You are an expert developer. If the user asks to build a full app or game, DO NOT write all the code at once. Follow this exact format: 1) Explain the game/app details. 2) Provide the full file structure. 3) Write the code for ONLY the first main file. 4) Tell the user to type 'next' to get the next file. If the request is malicious, reply 'SAFETY_BLOCK'.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    max_tokens: 2000,
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

export async function synthesize(prompt: string, drafts: WorkerResult[]): Promise<string> {
  const blockedKeywords = ["exploit", "malware", "ddos", "ransomware", "keylogger"];
  const lowerPrompt = prompt.toLowerCase();
  if (blockedKeywords.some((kw) => lowerPrompt.includes(kw))) {
    return "🛡️ **Safety Policy Notice:** This request was blocked because it contains potentially harmful or abusive topics.";
  }

  const workerSafetyBlock = drafts.some((d) => d.text.includes("SAFETY_BLOCK"));
  if (workerSafetyBlock) {
    return "🛡️ **Safety Policy Notice:** The AI models refused this prompt in accordance with safety and security guidelines.";
  }

  const usable = drafts.filter((d) => d.ok && d.text.trim().length > 0);
  
  // 🔥 THE NEW DETAILED ERROR LOGGER
  if (usable.length === 0) {
    const errorDetails = drafts
      .map((d) => `- **${d.name}:** ${d.error || "Refused to answer (Empty text)"}`)
      .join("\n");

    return `⚠️ **Worker Pipeline Failed:** All three background AI models failed to process this request. This usually happens if you hit an API rate limit or if your keys are missing.\n\n**Here are the specific errors from your APIs:**\n${errorDetails}`;
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
    "CRITICAL RULE: If the user asked to build a full app/game, your final output MUST only contain the explanation, the project structure, and ONE file of code. Ask the user to reply 'next' for the rest.",
    "Resolve contradictions, drop repetition, and never mention the drafts or models.",
    "Reply only with the final answer formatted in clean markdown.",
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
        generationConfig: { temperature: 0.4, maxOutputTokens: 4000 },
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
