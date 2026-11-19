import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import { conversationsTable, MessageDirections, messagesTable } from "@murmur/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/composer";
import { MessageBubble } from "@/components/message-bubble";
import { ReplyProvider } from "@/components/reply-context";
import { UserAvatar } from "@/components/user-avatar";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayName } from "@/lib/format";

const MESSAGES_LIMIT = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
    await requireAdmin();
    const { id } = await params;
    if (!UUID.test(id)) notFound();

    const conversation = await db.query.conversationsTable.findFirst({ where: eq(conversationsTable.id, id) });
    if (!conversation) notFound();

    // newest first; rendered in a column-reverse container so it sticks to the bottom
    const messages = await db.query.messagesTable.findMany({
        where: eq(messagesTable.conversationId, id),
        orderBy: (m, { desc }) => [desc(m.createdAt)],
        limit: MESSAGES_LIMIT,
        with: { replyTo: true },
    });

    await db
        .update(messagesTable)
        .set({ readAt: new Date() })
        .where(
            and(
                eq(messagesTable.conversationId, id),
                eq(messagesTable.direction, MessageDirections.incoming),
                isNull(messagesTable.readAt)
            )
        );

    const profileUrl = conversation.username
        ? `https://t.me/${conversation.username}`
        : `tg://user?id=${conversation.telegramUserId}`;

    const name = displayName(conversation);

    return (
        <ReplyProvider key={conversation.id}>
            <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
                <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    aria-label="Back"
                    nativeButton={false}
                    render={<Link href="/" />}
                >
                    <ArrowLeftIcon />
                </Button>
                <UserAvatar conversation={conversation} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{name}</span>
                        {conversation.status !== "active" && <Badge variant="outline">{conversation.status}</Badge>}
                    </div>
                    <a
                        href={profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs text-muted-foreground hover:underline"
                    >
                        {conversation.username ? `@${conversation.username}` : `id ${conversation.telegramUserId}`}
                        {conversation.languageCode && ` · ${conversation.languageCode}`}
                        {conversation.isPremium && " · premium"}
                    </a>
                </div>
            </header>
            <div className="flex flex-1 flex-col-reverse gap-2 overflow-y-auto p-3">
                {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} contactName={name} />
                ))}
                {messages.length === MESSAGES_LIMIT && (
                    <p className="text-center text-xs text-muted-foreground">Showing last {MESSAGES_LIMIT} messages</p>
                )}
            </div>
            <Composer
                key={conversation.id}
                conversationId={conversation.id}
                disabled={conversation.status === "blocked"}
            />
        </ReplyProvider>
    );
}
