import { ArrowUp, Bot, Loader2, Sparkles, User, Volume2, Square, Copy, Check, ChevronRight, Download, Share2, FileArchive, Image as ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { subscribeMessages, type MessageDoc } from "@/lib/chat";
import { downloadProjectZip, exportChatAsTxt } from "@/lib/project-export";
import { ImageGenerator } from "@/components/ImageGenerator";

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
  const [appMode, setAppMode] = useState<"chat" | "zip-builder" | "photo-gen">("chat");
  
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  function copyToClipboard(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function shareChatLink() {
    const shareUrl = `${window.location.origin}/share/${chatId}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Public shareable chat link copied! Anyone with this link can view this chat.");
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
      const history = messages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatId, prompt: text, history, mode: appMode }),
        signal: abortControllerRef.current.signal,
      });
      const data = await res.json() as { error?: string };
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

  if (appMode === "photo-gen") {
    return (
      <div className="flex flex-col h-screen flex-1">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Studio Mode</span>
          <select 
            value={appMode} 
            onChange={(e) => setAppMode(e.target.value as any)}
            className="bg-secondary text-secondary-foreground text-xs font-medium rounded-lg px-3 py-1.5 border border-border outline-none cursor-pointer"
          >
            <option value="chat">💬 AI Chat Mode</option>
            <option value="zip-builder">📦 Zip Code Builder (3 tokens)</option>
            <option value="photo-gen">🎨 AI Photo Generator (4 tokens)</option>
          </select>
        </div>
        <ImageGenerator />
      </div>
    );
  }

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col bg-background bg-mesh">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/60 backdrop-blur">
        <div className="flex items-center gap-2">
          <select 
            value={appMode} 
            onChange={(e) => setAppMode(e.target.value as any)}
            className="bg-secondary text-secondary-foreground text-xs font-medium rounded-lg px-3 py-1.5 border border-border outline-none cursor-pointer"
          >
            <option value="chat">💬 AI Chat Mode</option>
            <option value="zip-builder">📦 Zip Code Builder (3 tokens)</option>
            <option value="photo-gen">🎨 AI Photo Generator (4 tokens)</option>
          </select>
          {appMode === "zip-builder" && (
            <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded font-medium">
              File-by-file builder active
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={shareChatLink} className="h-7 text-xs gap-1.5">
            <Share2 className="size-3.5" /> Share Link
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportChatAsTxt(messages)} className="h-7 text-xs gap-1.5">
            <Download className="size-3.5" /> Export .txt
          </Button>
          <Button variant="default" size="sm" onClick={() => downloadProjectZip(messages)} className="h-7 text-xs gap-1.5 bg-primary text-primary-foreground">
            <FileArchive className="size-3.5" /> Download Zip
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {messages.length === 0 && !sending ? (
            <div className="mt-16 text-center px-4">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Sparkles className="size-6" />
              </span>
              <h1 className="mt-5 font-display text-2xl font-semibold">
                {appMode === "zip-builder" ? "AI Zip Project Builder" : "Ask anything"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {appMode === "zip-builder" 
                  ? "Describe your app or game. Get code file-by-file, click 'Next', and download the complete project zip instantly!" 
                  : "Three models answer, one synthesizes. You only see the best result."}
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
                    <div className="w-full overflow-x-auto rounded-2xl px-4 py-3 text-sm leading-relaxed border border-border bg-card text-card-foreground shadow-sm whitespace-pre-wrap">
                      {m.content}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground rounded-lg"
                        onClick={() => copyToClipboard(m.id, m.content)}
                      >
                        <Copy className="size-3.5 mr-1.5" /> Copy Message
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
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={appMode === "zip-builder" ? "Describe your app or type 'Next' to get the next file..." : "Send a message..."}
            rows={1}
            className="max-h-72 min-h-11 resize-none text-base sm:text-sm overflow-y-auto"
            disabled={sending}
          />
          <Button
            onClick={() => void send()}
            disabled={!sending && !prompt.trim()}
            className="size-11 shrink-0 p-0 rounded-xl"
          >
            <ArrowUp className="size-5" />
          </Button>
        </div>
        <p className="mt-2 text-center text-[10px] sm:text-xs text-muted-foreground">
          {appMode === "zip-builder" ? "📦 Zip Builder mode active (3 tokens per prompt)" : "Cost: 1-3 tokens per request."}
        </p>
      </div>
    </div>
  );
}
