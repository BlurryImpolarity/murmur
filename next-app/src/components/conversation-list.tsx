import { LogOutIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConversationLink } from "@/components/conversation-link";
import { Time } from "@/components/time";
import { UserAvatar } from "@/components/user-avatar";
import { appName } from "@/lib/app-name";
import { db } from "@/lib/db";
import { displayName, messagePreview } from "@/lib/format";
import { logout } from "@/app/login/actions";

export async function ConversationList() {
    const conversations = await db.query.conversationsTable.findMany({
        orderBy: (t, { sql }) => [sql`${t.lastMessageAt} desc nulls last`],
        with: { messages: { orderBy: (m, { desc }) => [desc(m.createdAt)], limit: 1 } },
        extras: (t, { sql }) => ({
            unread: sql<number>`(select count(*)::int from messages m where m.conversation_id = ${t.id} and m.direction = 'incoming' and m.read_at is null)`.as(
                "unread"
            ),
        }),
    });

    return (
        <>
            <header className="flex h-14 shrink-0 items-center justify-between border-b px-3">
                <span className="font-heading text-sm font-semibold">{appName()}</span>
                <form action={logout}>
                    <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
                        <LogOutIcon />
                    </Button>
                </form>
            </header>
            <nav className="flex-1 overflow-y-auto">
                {conversations.length === 0 && (
                    <p className="p-6 text-center text-xs text-muted-foreground">No conversations yet</p>
                )}
                {conversations.map((conversation) => {
                    const last = conversation.messages[0];
                    return (
                        <ConversationLink key={conversation.id} id={conversation.id}>
                            <UserAvatar conversation={conversation} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium">{displayName(conversation)}</span>
                                    {conversation.status !== "active" && (
                                        <Badge variant="outline">{conversation.status}</Badge>
                                    )}
                                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                        {conversation.lastMessageAt && (
                                            <Time date={conversation.lastMessageAt} relative />
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-xs text-muted-foreground">
                                        {last && (last.direction === "outgoing" ? "You: " : "") + messagePreview(last)}
                                    </span>
                                    {conversation.unread > 0 && (
                                        <Badge className="ml-auto">{conversation.unread}</Badge>
                                    )}
                                </div>
                            </div>
                        </ConversationLink>
                    );
                })}
            </nav>
        </>
    );
}
