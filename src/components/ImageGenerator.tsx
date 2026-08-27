import { useState, useRef } from "react";
import { Sparkles, Loader2, Download, Wand2, Code } from "lucide-react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";

export function ImageGenerator() {
  const { getIdToken } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"square" | "banner" | "avatar">("square");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ htmlCode: string } | null>(null);
  
  const designRef = useRef<HTMLDivElement>(null);

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
      if (!res.ok) throw new Error(data.error || "Generation failed");

      setResult({ htmlCode: data.htmlCode });
      toast.success("Graphic code rendered successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  // Convert the rendered HTML block into a downloadable PNG photo
  async function downloadAsPhoto() {
    if (!designRef.current) return;
    
    try {
      const toastId = toast.loading("Converting design to photo...");
      const canvas = await html2canvas(designRef.current, {
        useCORS: true,
        scale: 2, // High resolution
        backgroundColor: null
      });
      
      const link = document.createElement("a");
      link.download = `ai-design-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      
      toast.dismiss(toastId);
      toast.success("Photo downloaded successfully!");
    } catch (err) {
      toast.error("Failed to save photo.");
    }
  }

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col bg-background bg-mesh overflow-y-auto px-4 py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        
        <div className="text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary mb-3">
            <Code className="size-6" />
          </span>
          <h1 className="font-display text-2xl font-semibold">AI Code-to-Design Studio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generates flawless banners using code. Perfect text, perfect layouts.
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
            Describe your graphic layout
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Free Fire solo tournament banner, glowing neon blue background, bold white text..."
            className="min-h-24 resize-none border-none bg-transparent p-0 text-sm focus-visible:ring-0"
            disabled={loading}
          />
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="size-3 text-primary" /> Costs 4 tokens per generation
            </span>
            <Button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="rounded-xl px-5 py-2 text-xs font-medium"
            >
              {loading ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Wand2 className="size-4 mr-1.5" />}
              {loading ? "Writing Design Code..." : "Generate Graphic"}
            </Button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center p-12 gap-3 rounded-2xl border border-border bg-card/50">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">AI is writing HTML/CSS and rendering your design...</p>
          </div>
        )}

        {result && !loading && (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Code className="size-3.5 text-primary" /> Live Code Render
              </span>
              <Button
                onClick={downloadAsPhoto}
                className="inline-flex items-center gap-1 text-xs px-4 py-2 rounded-xl font-medium"
              >
                <Download className="size-4 mr-1" /> Download as Photo (PNG)
              </Button>
            </div>

            {/* This is where the magic happens! The raw code is rendered as a visual graphic */}
            <div className="overflow-x-auto rounded-xl bg-zinc-950 flex items-center justify-center border border-zinc-800 p-4">
              <div 
                ref={designRef} 
                className="shadow-2xl flex-shrink-0"
                dangerouslySetInnerHTML={{ __html: result.htmlCode }} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
