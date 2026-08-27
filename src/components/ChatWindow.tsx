import { ArrowUp, Bot, Loader2, Sparkles, User, Volume2, Square, Copy, Check, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { subscribeMessages, type MessageDoc } from "@/lib/chat";

const STAGES = [
  "Consulting three models in parallel…",
  "Comparing and cross-checking drafts…",
  "Synthesizing the final answer…",
];

export function ChatWindow({ chatId }: { chatId: string }) {
  const { getIdToken } = useAuth();
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [stage, setStage] = useState(0);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController null |>(null);

  useEffect(() => subscribeMessages(chatId, setMessages), [chatId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!sending) {
      setStage(0);
      return;
    }
    const id = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 3000);
    return () => clearInterval(id);
  }, [sending]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  function toggleSpeech(messageId: string, text: string) {
    if (speakingId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel(); 
    
    const cleanText = text.replace(/```[\s\S]*?```/g, " [Code block omitted from audio] ").replace(/[#*`]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    const voices = window.speechSynthesis.getVoices();
    const betterVoice = voices.find(v => 
      v.name.includes("Google UK English") || 
      v.name.includes("Google US English") || 
      v.name.includes("Samantha")
    );
    if (betterVoice) utterance.voice = betterVoice;
    
    utterance.rate = 1.05;
    utterance.pitch = 1.1;

    utterance.onend = () => setSpeakingId(null);
    setSpeakingId(messageId);
    window.speechSynthesis.speak(utterance);
  }

  function copyToClipboard(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function stopGenerating() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }

  async function send(overrideText?: string) {
    const text = (overrideText || prompt).trim();
    if (!text || sending) return;
    
    setSending(true);
    if (!overrideText) setPrompt("");
    
    if (textareaRef.current && !overrideText) {
      textareaRef.current.style.height = "auto";
    }

    abortControllerRef.current = new AbortController();

    try {
      const token = await getIdToken();
      const history = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatId, prompt: text, history }),
        signal: abortControllerRef.current.signal,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
    } catch (error: any) {
      if (error.name === "AbortError") {
        toast("Generation stopped.");
        if (!overrideText) setPrompt(text);
      } else {
        toast.error(error.message);
        if (!overrideText) setPrompt(text);
      }
    } finally {
      setSending(false);
      abortControllerRef.current = null;
    }
  }

  // Bulletproof code block and text parser
  function renderMessage(content: string, messageId: string) {
    // Regex splits by ```lang ... ``` blocks safely
    const parts = content.split(/(```[\w]*\n[\s\S]*?```)/g);

    return parts.map((part, index) => {
      const trimmed = part.trim();
      if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
        const firstNewline = trimmed.indexOf("\n");
        const language = trimmed.slice(3, firstNewline).trim();
        const code = trimmed.slice(firstNewline + 1, -3).trim();
        const blockId = `${messageId}-code-${index}`;

        return (
          <div key={index} className="my-3 overflow-hidden rounded-md bg-zinc-950 border border-zinc-800 w-full">
            <div className="flex items-center justify-between bg-zinc-900 px-4 py-2 text-xs text-zinc-400 font-mono">
              <span className="uppercase">{language || "code"}</span>
              <button
                onClick={() => copyToClipboard(blockId, code)}
                className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors bg-zinc-800/60 px-2.5 py-1 rounded border border-zinc-700/50"
              >
                {copiedId === blockId ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
                {copiedId === blockId ? <span className="text-green-400 font-medium">Copied!</span> : "Copy Code"}
              </button>
            </div>
            <pre className="overflow-x-auto p-4 text-[13px] text-zinc-50 leading-relaxed font-mono">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      if (!part) return null;

      // Regular text block with individual copy text button option if needed
      const textBlockId = `${messageId}-text-${index}`;
      return (
        <div key={index} className="relative group my-1">
          <span className="whitespace-pre-wrap block leading-relaxed">{part}</span>
        </div>
      );
    });
  }

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col bg-background bg-mesh">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {messages.length === 0 && !sending ? (
            <div className="mt-16 text-center px-4">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Sparkles className="size-6" />
              </span>
              <h1 className="mt-5 font-display text-2xl font-semibold">Ask anything</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Three models answer, one synthesizes. You only see the best result.
              </p>
            </div>
          ) : null}

          {messages.map((m, index) => {
            const isLatest = index === messages.length - 1;
            const hasNextPrompt = m.content.toLowerCase().includes("next") || m.content.toLowerCase().includes("file");

            return (
              <div key={m.id} className={`flex gap-3 w-full ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" ? (
                  <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary hidden sm:flex">
                    <Bot className="size-4" />
                  </span>
                ) : null}

                {m.role === "assistant" ? (
                  <div className="flex flex-col gap-2 items-start max-w-[100%] sm:max-w-[85%] min-w-0 w-full">
                    <div className="w-full overflow-x-auto rounded-2xl px-4 py-3 text-sm leading-relaxed border border-border bg-card text-card-foreground shadow-sm">
                      {renderMessage(m.content, m.id)}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground rounded-lg"
                        onClick={() => toggleSpeech(m.id, m.content)}
                      >
                        {speakingId === m.id ? (
                          <Square className="size-3.5 mr-1.5" />
                        ) : (
                          <Volume2 className="size-3.5 mr-1.5" />
                        )}
                        {speakingId === m.id ? "Stop" : "Read aloud"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground rounded-lg"
                        onClick={() => copyToClipboard(m.id, m.content)}
                      >
                        {copiedId === m.id ? (
                          <Check className="size-3.5 mr-1.5 text-green-500" />
                        ) : (
                          <Copy className="size-3.5 mr-1.5" />
                        )}
                        {copiedId === m.id ? "Copied" : "Copy Full Answer"}
                      </Button>
                      
                      {isLatest && hasNextPrompt && !sending && (
                        <Button 
                          onClick={() => send("Next")}
                          size="sm"
                          className="h-7 px-3 text-xs bg-primary/20 text-primary hover:bg-primary/30 rounded-lg ml-auto border border-primary/20"
                        >
                          Next File <ChevronRight className="size-3.5 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[90%] sm:max-w-[85%] break-words rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-primary text-primary-foreground shadow-sm">
                    {m.content}
                  </div>
                )}

                {m.role === "user" ? (
                  <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground hidden sm:flex">
                    <User className="size-4" />
                  </span>
                ) : null}
              </div>
            );
          })}

          {sending ? (
            <div className="flex gap-3 w-full">
              <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary hidden sm:flex">
                <Bot className="size-4" />
              </span>
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground max-w-[90%] shadow-sm">
                <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                <span className="truncate">{STAGES[stage]}</span>
              </div>
            </div>
          ) : null}

          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-border bg-surface/70 px-2 sm:px-4 py-3 sm:py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleInput}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Send a message..."
            rows={1}
            className="max-h-72 min-h-11 resize-none text-base sm:text-sm overflow-y-auto"
            disabled={sending}
          />
          <Button
            aria-label={sending ? "Stop generating" : "Send message"}
            onClick={sending ? stopGenerating : () => void send()}
            disabled={!sending && !prompt.trim()}
            className={`size-11 shrink-0 p-0 rounded-xl transition-all ${
              sending ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""
            }`}
          >
            {sending ? (
              <Square className="size-4 fill-current" />
            ) : (
              <ArrowUp className="size-5" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-center text-[10px] sm:text-xs text-muted-foreground">
          Cost varies by task size: 1 token (Short) • 2 tokens (Medium) • 3 tokens (Large Code).
        </p>
      </div>
    </div>
  );
}
