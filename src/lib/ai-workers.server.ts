const WORKER_TIMEOUT_MS = 25_000;

async function postJson(url: string, apiKey: string, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  } finally {
    clearTimeout(timer);
  }
}

function chatBody(model: string, prompt: string, history: any[] = []) {
  const safeHistory = history.map(m => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content
  }));

  return {
    model,
    messages: [
      {
        role: "system",
        content: "You are an expert developer. If the user asks to build an app/game, DO NOT write all code at once. 1) Explain details. 2) Provide file structure. 3) Write ONLY the first main file. 4) Tell the user to type 'next' to get the next file. If the request is malicious, reply 'SAFETY_BLOCK'.",
      },
      ...safeHistory,
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    max_tokens: 2000,
  };
}

async function callGroq(prompt: string, history: any[]) {
  const key = process.env['GROQ_API_KEY'];
  if (!key) throw new Error("Missing GROQ_API_KEY");
  const json = await postJson("https://api.groq.com/openai/v1/chat/completions", key, chatBody(process.env['GROQ_MODEL'] ?? "llama-3.1-70b-versatile", prompt, history));
  return json.choices?.[0]?.message?.content ?? "";
}

async function callOpenRouter(prompt: string, history: any[]) {
  const key = process.env['OPENROUTER_API_KEY'];
  if (!key) throw new Error("Missing OPENROUTER_API_KEY");
  const json = await postJson("https://openrouter.ai/api/v1/chat/completions", key, chatBody(process.env['OPENROUTER_MODEL'] ?? "meta-llama/llama-3.1-70b-instruct", prompt, history));
  return json.choices?.[0]?.message?.content ?? "";
}

async function callCerebras(prompt: string, history: any[]) {
  const key = process.env['CEREBRAS_API_KEY'];
  if (!key) throw new Error("Missing CEREBRAS_API_KEY");
  const json = await postJson("https://api.cerebras.ai/v1/chat/completions", key, chatBody(process.env['CEREBRAS_MODEL'] ?? "llama3.1-70b", prompt, history));
  return json.choices?.[0]?.message?.content ?? "";
}

export type WorkerResult = { name: string; text: string; ok: boolean; error?: string };

export async function runWorkers(prompt: string, history: any[] = []): Promise<WorkerResult[]> {
  const workers: Array<[string, Promise<string>]> = [
    ["Groq", callGroq(prompt, history)],
    ["OpenRouter", callOpenRouter(prompt, history)],
    ["Cerebras", callCerebras(prompt, history)],
  ];

  const settled = await Promise.all(
    workers.map(async ([name, promise]): Promise<WorkerResult> => {
      try { return { name, text: await promise, ok: true }; }
      catch (error) { return { name, text: "", ok: false, error: (error as Error).message }; }
    }),
  );
  return settled;
}

export async function synthesize(prompt: string, drafts: WorkerResult[], history: any[] = []): Promise<string> {
  const blockedKeywords = ["exploit", "malware", "ddos", "ransomware", "keylogger"];
  if (blockedKeywords.some((kw) => prompt.toLowerCase().includes(kw))) {
    return "🛡️ **Safety Policy Notice:** This request was blocked.";
  }

  if (drafts.some((d) => d.text.includes("SAFETY_BLOCK"))) {
    return "🛡️ **Safety Policy Notice:** The AI models refused this prompt.";
  }

  const usable = drafts.filter((d) => d.ok && d.text.trim().length > 0);
  
  if (usable.length === 0) {
    const errorDetails = drafts.map((d) => `- **${d.name}:** ${d.error || "Empty text"}`).join("\n");
    return `⚠️ **Worker Pipeline Failed:** All AI models failed.\n\nErrors:\n${errorDetails}`;
  }

  const key = process.env['GEMINI_API_KEY'];
  
  if (!key) {
    return usable[0].text;
  }

  const draftBlock = usable.map((d, i) => `### Draft ${i + 1} (${d.name})\n${d.text}`).join("\n\n");
  const historyText = history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join("\n\n");

  const instruction = [
    "You are the synthesis layer of a multi-model system.",
    "Merge the drafts into ONE final answer that perfectly continues the conversation.",
    "CRITICAL RULE: If the user asked for the 'next' file of an app/game, provide exactly the next file based on the history context.",
    "Reply only with the final answer formatted in clean markdown.",
    "",
    "## Chat History Context",
    historyText || "(No previous history)",
    "",
    `## User's Latest Prompt\n${prompt}`,
    "",
    `## Drafts to Synthesize\n${draftBlock}`,
  ].join("\n");

  const model = process.env['GEMINI_MODEL'] ?? "gemini-1.5-flash";
  
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: instruction }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4000 },
      }),
    });

    if (!res.ok) {
      console.warn("Gemini quota hit, falling back to Groq draft.");
      return usable[0].text;
    }

    const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")?.trim();
    
    if (!text) return usable[0].text;
    return text;
  } catch (err) {
    return usable[0].text;
  }
}
