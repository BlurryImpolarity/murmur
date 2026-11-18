"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { conversationsTable, MessageDirections, messagesTable, MessageStatuses, MessageTypes } from "@murmur/db";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const MAX_TEXT_LENGTH = 4096; // telegram limit

// Queues a text message; the bot picks up `pending` messages and delivers them
export async function sendTextMessage(conversationId: string, text: string) {
    await requireAdmin();

    const body = text.trim();
    if (!body) return;
    if (body.length > MAX_TEXT_LENGTH) throw new Error(`Message is longer than ${MAX_TEXT_LENGTH} characters`);

    await db.insert(messagesTable).values({
        conversationId,
        direction: MessageDirections.outgoing,
        type: MessageTypes.text,
        text: body,
        status: MessageStatuses.pending,
    });
    await db
        .update(conversationsTable)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversationsTable.id, conversationId));

    revalidatePath("/", "layout");
}
