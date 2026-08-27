import { toast } from "sonner";

export async function downloadProjectZip(messages: Array<{ role: string; content: string }>) {
  let combinedCodeFiles = "";
  let fileCount = 0;

  messages.forEach((m, msgIndex) => {
    const codeBlockRegex = /```([\w-]+)?(?:\s*\/\/\s*([^\n]+)|\n)?([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(m.content)) !== null) {
      const lang = match[1] || "txt";
      let filename = match[2]?.trim() || `file_${msgIndex}_${fileCount}.${lang === "java" ? "java" : lang === "python" ? "py" : lang === "html" ? "html" : "txt"}`;
      const codeContent = match[3].trim();

      combinedCodeFiles += `\n\n========================================\n`;
      combinedCodeFiles += `FILE: ${filename}\n`;
      combinedCodeFiles += `========================================\n\n`;
      combinedCodeFiles += codeContent;
      fileCount++;
    }
  });

  if (fileCount === 0) {
    toast.error("No code files found in this chat yet!");
    return;
  }

  // Creates a downloadable project bundle text file containing all structured files
  const blob = new Blob([combinedCodeFiles], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `project-code-bundle-${Date.now()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  toast.success(`Successfully downloaded bundle with ${fileCount} code files!`);
}

export function exportChatAsTxt(messages: Array<{ role: string; content: string }>) {
  const textContent = messages
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}\n\n-----------------------------------\n\n`)
    .join("");

  const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `chat-transcript-${Date.now()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  toast.success("Chat transcript downloaded as .txt!");
}
