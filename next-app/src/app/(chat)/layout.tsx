import { AutoRefresh } from "@/components/auto-refresh";
import { ChatShell } from "@/components/chat-shell";
import { ConversationList } from "@/components/conversation-list";
import { requireAdmin } from "@/lib/auth";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
    await requireAdmin();

    return (
        <ChatShell sidebar={<ConversationList />}>
            <AutoRefresh />
            {children}
        </ChatShell>
    );
}
