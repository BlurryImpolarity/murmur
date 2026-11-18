import { env } from "./env";
import { Composer, Telegraf } from "telegraf-hardened";
import { db } from "./db";
import { adminComposer, loadAdmin } from "./admin";
import { checkGroupChat } from "./group-reply";
import { inbox } from "./inbox";
import { startOutbox } from "./outbox";
import { installRateLimit } from "./rate-limit";
import type { BotContext } from "./context";

installRateLimit();
const bot = new Telegraf<BotContext>(env.botToken);

bot.use(
    Composer.privateChat(
        loadAdmin,
        Composer.branch((ctx) => !!ctx.admin, adminComposer, inbox)
    )
);
bot.catch((err) => console.error("bot error", err));

async function main() {
    await checkGroupChat(bot.telegram);
    const stopOutbox = await startOutbox(bot.telegram);

    const shutdown = async (signal: string) => {
        stopOutbox();
        bot.stop(signal);
        await db.$client.end();
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    await bot.launch(() => console.log("bot started"));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
