import { desc, and, isNotNull } from "drizzle-orm";
import { messagesTable } from "@murmur/db";
import { db } from "./src/db";
(async () => {
    const media = await db.select({ kind: messagesTable.mediaKind, type: messagesTable.type, fileId: messagesTable.fileId }).from(messagesTable).where(and(isNotNull(messagesTable.fileId))).orderBy(desc(messagesTable.createdAt)).limit(40);
    const pick = ["photo", "video", "sticker"].map((k) => media.find((m) => (m.kind ?? m.type) === k)).filter(Boolean) as typeof media;
    const fresh = media.filter((m) => !pick.includes(m)).slice(0, 2);
    for (const [label, list] of [["same files again", pick], ["other, never fetched", fresh]] as const) {
        for (const m of list) {
            const t = performance.now();
            const r: any = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${m.fileId}`).then((x) => x.json());
            console.log(`${label.padEnd(22)} ${(m.kind ?? m.type)!.padEnd(8)} getFile ${Math.round(performance.now() - t)}ms ok=${r.ok}`);
        }
    }
    await db.$client.end();
})();
