import { useState } from "react";
import { Sparkles, Loader2, Download, Image as ImageIcon, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";

export function ImageGenerator() {
  const { getIdToken } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"square" | "banner" | "avatar">("square");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageUrl: string; enhancedPrompt: string } | null>(null);

  async function handleGenerate() {
    const text = prompt.trim();
    if (!text || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const token = await getIdToken();
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: text, aspectRatio }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed");

      setResult({
        imageUrl: data.imageUrl,
        enhancedPrompt: data.enhancedPrompt,
      });
      toast.success("Image generated successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col bg-background bg-mesh overflow-y-auto px-4 py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        
        <div className="text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary mb-3">
            <Wand2 className="size-6" />
          </span>
          <h1 className="font-display text-2xl font-semibold">AI Image Studio (FLUX)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generates epic gaming banners with real graphics and text using FLUX AI.
          </p>
        </div>

        <div className="flex rounded-xl bg-card border border-border p-1">
          <button
            onClick={() => setAspectRatio("square")}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
              aspectRatio === "square" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Logo / Square (1:1)
          </button>
          <button
            onClick={() => setAspectRatio("banner")}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
              aspectRatio === "banner" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Esports / FF Banner (16:9)
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Describe your image
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g. A Free Fire gaming banner, character holding an assault rifle, fire in background, text says "SOLO TOURNAMENT"'
            className="min-h-24 resize-none border-none bg-transparent p-0 text-sm focus-visible:ring-0"
            disabled={loading}
          />
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="size-3 text-primary" /> Costs 4 tokens
            </span>
            <Button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="rounded-xl px-5 py-2 text-xs font-medium"
            >
              {loading ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Wand2 className="size-4 mr-1.5" />}
              {loading ? "Generating Image..." : "Generate Graphic"}
            </Button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center p-12 gap-3 rounded-2xl border border-border bg-card/50">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">AI is drawing your image...</p>
          </div>
        )}

        {result && !loading && (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <ImageIcon className="size-3.5 text-primary" /> Generated Image
              </span>
              <a
                href={result.imageUrl}
                target="_blank"
                rel="noreferrer"
                download="ai-graphic.png"
                className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-xl font-medium transition-colors shadow-sm"
              >
                <Download className="size-4" /> Download Full Image
              </a>
            </div>

            <div className="overflow-hidden rounded-xl bg-zinc-950 flex items-center justify-center border border-zinc-800 p-2">
              <img
                src={result.imageUrl}
                alt={prompt}
                className="max-h-[450px] w-auto object-contain rounded-lg transition-transform hover:scale-[1.01]"
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
