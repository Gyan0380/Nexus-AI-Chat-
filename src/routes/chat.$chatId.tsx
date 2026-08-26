import { createFileRoute } from "@tanstack/react-router";

import { AuthGuard } from "@/components/AuthGuard";
import { ChatWindow } from "@/components/ChatWindow";
import { Sidebar } from "@/components/Sidebar";

export const Route = createFileRoute("/chat/$chatId")({
  head: () => ({
    meta: [
      { title: "Chat — Synthesis AI" },
      {
        name: "description",
        content: "Ask a question and get one synthesized answer built from three AI models.",
      },
      { property: "og:title", content: "Chat — Synthesis AI" },
      {
        property: "og:description",
        content: "Ask a question and get one synthesized answer built from three AI models.",
      },
    ],
  }),
  component: ChatRoute,
});

function ChatRoute() {
  const { chatId } = Route.useParams();

  return (
    <AuthGuard chatId={chatId}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar activeChatId={chatId} />
        <ChatWindow chatId={chatId} />
      </div>
    </AuthGuard>
  );
}
