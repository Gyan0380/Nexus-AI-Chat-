import { toast } from "sonner";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export function exportChatAsTxt(messages: Array<{ role: string; content: string }>) {
  const textContent = messages
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}\n\n-----------------------------------\n\n`)
    .join("");

  const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `chat-export-${Date.now()}.txt`);
  toast.success("Chat downloaded as .txt!");
}

export function generateShareableLink(chatId: string) {
  const url = `${window.location.origin}/share/${chatId}`;
  navigator.clipboard.writeText(url);
  toast.success("Shareable chat link copied to clipboard!");
  return url;
}

// Automatically bundle all code blocks from messages into structured folders & zip file
export async function downloadProjectZip(messages: Array<{ role: string; content: string }>) {
  const zip = new JSZip();
  let fileCount = 0;

  messages.forEach((m, msgIndex) => {
    // Match markdown code blocks with filenames or languages
    const codeBlockRegex = /```([\w-]+)?(?:\s*\/\/\s*([^\n]+)|\n)?([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(m.content)) !== null) {
      const lang = match[1] || "txt";
      let filename = match[2]?.trim() || `file_${msgIndex}_${fileCount}.${lang === "java" ? "java" : lang === "python" ? "py" : "txt"}`;
      const codeContent = match[3].trim();

      zip.file(filename, codeContent);
      fileCount++;
    }
  });

  if (fileCount === 0) {
    toast.error("No code blocks found in this chat to zip!");
    return;
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `ai-project-files-${Date.now()}.zip`);
  toast.success(`Successfully downloaded zip with ${fileCount} code files!`);
}
