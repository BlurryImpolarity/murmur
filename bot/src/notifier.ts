import type { Telegram } from "telegraf-hardened";
import { adminsTable, conversationsTable, MessageDirections, messagesTable, MessageStatuses } from "@murmur/db";
import { and, count, desc, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "./db";
import { env } from "./env";

const TOP_CONVERSATIONS = 5;

// Every NOTIFY_INTERVAL_MS sends admins a short summary, but only if new incoming messages arrived
// that are still unread (messages already read in the web app don't trigger it).
// Window starts at bot start, so a restart doesn't re-notify about older messages.
export function startNotifier(telegram: Telegram): () => void {
    if (!env.notifyIntervalMs) return () => {};

    let since = new Date();
    const timer = setInterval(async () => {
        const until = new Date();
        try {
            await notify(telegram, since, until);
            since = until;
        } catch (err) {
            // keep `since`, so the next run covers this window too
            console.error("notifier failed", err);
        }
    }, env.notifyIntervalMs);

    return () => clearInterval(timer);
}

export async function notify(telegram: Telegram, since: Date, until: Date) {
    const inWindow = (column: typeof messagesTable.createdAt | typeof conversationsTable.createdAt) =>
        and(gt(column, since), lte(column, until));

    const perConversation = await db
        .select({
            firstName: conversationsTable.firstName,
            lastName: conversationsTable.lastName,
            username: conversationsTable.username,
            messages: count(),
        })
        .from(messagesTable)
        .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
        .where(
            and(
                eq(messagesTable.direction, MessageDirections.incoming),
                isNull(messagesTable.readAt),
                inWindow(messagesTable.createdAt)
            )
        )
        .groupBy(conversationsTable.id)
        .orderBy(desc(count()));
    if (!perConversation.length) return;

    const [[newConversations], [unread], [failed], admins] = await Promise.all([
        db.select({ n: count() }).from(conversationsTable).where(inWindow(conversationsTable.createdAt)),
        db
            .select({ n: count() })
            .from(messagesTable)
            .where(and(eq(messagesTable.direction, MessageDirections.incoming), isNull(messagesTable.readAt))),
        db
            .select({ n: count() })
            .from(messagesTable)
            .where(and(eq(messagesTable.status, MessageStatuses.failed), inWindow(messagesTable.createdAt))),
        db
            .select({ telegramUserId: adminsTable.telegramUserId })
            .from(adminsTable)
            .where(isNotNull(adminsTable.telegramUserId)),
    ]);

    const total = perConversation.reduce((sum, row) => sum + row.messages, 0);
    const lines = [
        `📬 ${plural(total, "new unread message")} in ${plural(perConversation.length, "conversation")}` +
            (newConversations.n ? ` (${newConversations.n} new)` : ""),
        ...perConversation.slice(0, TOP_CONVERSATIONS).map((row) => {
            const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
            return `• ${name}${row.username ? ` (@${row.username})` : ""}: ${row.messages}`;
        }),
    ];
    if (perConversation.length > TOP_CONVERSATIONS)
        lines.push(`• …and ${perConversation.length - TOP_CONVERSATIONS} more`);
    lines.push(`Unread: ${unread.n}`);
    if (failed.n) lines.push(`⚠️ Failed to send: ${failed.n}`);
    const text = lines.join("\n");

    for (const admin of admins) {
        try {
            await telegram.sendMessage(admin.telegramUserId!, text);
        } catch (err) {
            // e.g. admin never started the bot or blocked it
            console.warn(`notifier: can't reach admin ${admin.telegramUserId}: ${(err as Error).message}`);
        }
    }
}

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}
