import { setTimeout as sleep } from "node:timers/promises";
import { Telegram, TelegramError } from "telegraf-hardened";

// Telegram limits: ~30 messages/s overall, ~1 message/s per chat (short bursts tolerated).
// Stay a bit under both.
const GLOBAL_INTERVAL_MS = 40; // 25 msg/s
const CHAT_INTERVAL_MS = 1000;
const MAX_RETRIES_ON_429 = 3;

// Paces calls by reserving time slots: first per chat, then globally.
// Slots are reserved synchronously, so concurrent callers queue up instead of bursting.
class RateLimiter {
    private globalNextAt = 0;
    private chatNextAt = new Map<string, number>();

    async acquire(chatId: string | number | undefined) {
        if (chatId !== undefined) {
            const key = String(chatId);
            const now = Date.now();
            const at = Math.max(now, this.chatNextAt.get(key) ?? 0);
            this.chatNextAt.set(key, at + CHAT_INTERVAL_MS);
            this.prune(now);
            if (at > now) await sleep(at - now);
        }

        const now = Date.now();
        const at = Math.max(now, this.globalNextAt);
        this.globalNextAt = at + GLOBAL_INTERVAL_MS;
        if (at > now) await sleep(at - now);
    }

    // after a 429 nothing should be sent until telegram allows it again
    pause(ms: number) {
        this.globalNextAt = Math.max(this.globalNextAt, Date.now() + ms);
    }

    private prune(now: number) {
        if (this.chatNextAt.size < 1000) return;
        for (const [key, at] of this.chatNextAt) if (at < now) this.chatNextAt.delete(key);
    }
}

// methods that post something into a chat and count towards telegram's flood limits
function isSendingMethod(method: string): boolean {
    return method.startsWith("send") || method === "copyMessage" || method === "forwardMessage";
}

let installed = false;

// Patches Telegram.prototype.callApi: telegraf creates a new Telegram client per update (ctx.telegram),
// so patching one instance would miss ctx.reply(). One shared limiter covers every client.
// On 429 waits `retry_after` and retries instead of failing.
export function installRateLimit() {
    if (installed) return;
    installed = true;

    const limiter = new RateLimiter();
    const original = Telegram.prototype.callApi;

    Telegram.prototype.callApi = async function (
        this: Telegram,
        method: string,
        payload: { chat_id?: string | number },
        options?: unknown
    ) {
        const callApi = (original as Function).bind(this);
        if (!isSendingMethod(method)) return callApi(method, payload, options);

        for (let attempt = 0; ; attempt++) {
            await limiter.acquire(payload?.chat_id);
            try {
                return await callApi(method, payload, options);
            } catch (err) {
                if (!(err instanceof TelegramError) || err.code !== 429 || attempt >= MAX_RETRIES_ON_429) throw err;
                const retryAfterMs = (err.parameters?.retry_after ?? 1) * 1000;
                console.warn(`telegram 429 on ${method}, retrying in ${retryAfterMs}ms`);
                limiter.pause(retryAfterMs);
            }
        }
    } as Telegram["callApi"];
}
