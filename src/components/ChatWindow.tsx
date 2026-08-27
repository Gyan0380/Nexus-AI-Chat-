import { ArrowUp, Bot, Loader2, Sparkles, User, Volume2, Square, Copy, Check } from "lucide-react";
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

  function toggleSpeech(messageId: string, text: string) {
    if (speakingId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeakingId(null);
    setSpeakingId(messageId);
    window.speechSynthesis.speak(utterance);
  }

  function copyToClipboard(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function send() {
    const text = prompt.trim();
    if (!text || sending) return;
    setSending(true);
    setPrompt("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatId, prompt: text }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
    } catch (error) {
      toast.error((error as Error).message);
      setPrompt(text);
    } finally {
      setSending(false);
    }
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

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 w-full ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" ? (
                <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary hidden sm:flex">
                  <Bot className="size-4" />
                </span>
              ) : null}

              {m.role === "assistant" ? (
                <div className="flex flex-col gap-1 items-start max-w-[90%] sm:max-w-[85%] min-w-0">
                  <div className="w-full overflow-x-auto rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap border border-border bg-card text-card-foreground">
                    {m.content}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground hover:bg-transparent hover:text-primary"
                      onClick={() => toggleSpeech(m.id, m.content)}
                    >
                      {speakingId === m.id ? (
                        <Square className="size-3 mr-1" />
                      ) : (
                        <Volume2 className="size-3 mr-1" />
                      )}
                      {speakingId === m.id ? "Stop" : "Read aloud"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground hover:bg-transparent hover:text-primary"
                      onClick={() => copyToClipboard(m.id, m.content)}
                    >
                      {copiedId === m.id ? (
                        <Check className="size-3 mr-1 text-green-500" />
                      ) : (
                        <Copy className="size-3 mr-1" />
                      )}
                      {copiedId === m.id ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="max-w-[90%] sm:max-w-[85%] break-words rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-primary text-primary-foreground">
                  {m.content}
                </div>
              )}

              {m.role === "user" ? (
                <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground hidden sm:flex">
                  <User className="size-4" />
                </span>
              ) : null}
            </div>
          ))}

          {sending ? (
            <div className="flex gap-3 w-full">
              <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary hidden sm:flex">
                <Bot className="size-4" />
              </span>
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground max-w-[90%]">
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
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Send a message..."
            rows={1}
            className="max-h-32 min-h-11 resize-none text-base sm:text-sm"
            disabled={sending}
          />
          <Button
            aria-label="Send message"
            onClick={() => void send()}
            disabled={sending || !prompt.trim()}
            className="size-11 shrink-0 p-0 rounded-xl"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-5" />}
          </Button>
        </div>
        <p className="mt-2 text-center text-[10px] sm:text-xs text-muted-foreground">
          Each answer costs 1 token.
        </p>
      </div>
    </div>
  );
}
