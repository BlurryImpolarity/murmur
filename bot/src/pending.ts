// One pending "next message" action per admin (e.g. /reply waiting for the reply, /addpack waiting for a sticker).
// Starting a new one replaces the previous; /cancel clears it.

export type PendingAction =
    | { kind: "groupReply"; messageId: number }
    | { kind: "addPack" }
    | { kind: "addSticker"; collection: string }
    // null: remove from every custom collection
    | { kind: "removeSticker"; collection: string | null }
    | { kind: "addGif" }
    | { kind: "removeGif" }
    // /removecollection without a name: waits for a sticker from the pack
    | { kind: "removePackBySticker" }
    // waits for /confirm instead of a message
    | { kind: "removeCollection"; collectionIds: string[]; label: string };

const TTL_MS = 10 * 60 * 1000;
const actions = new Map<number, { action: PendingAction; expiresAt: number }>();

export function setPending(userId: number, action: PendingAction) {
    actions.set(userId, { action, expiresAt: Date.now() + TTL_MS });
}

export function getPending(userId: number): PendingAction | undefined {
    const entry = actions.get(userId);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
        actions.delete(userId);
        return undefined;
    }
    return entry.action;
}

export function clearPending(userId: number): boolean {
    return actions.delete(userId);
}
