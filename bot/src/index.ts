import { env } from "./env";
import { Composer, Telegraf } from "telegraf-hardened";
import { db } from "./db";
import { adminComposer, loadAdmin } from "./admin";
import { inbox } from "./inbox";
import { startOutbox } from "./outbox";
import type { BotContext } from "./context";

const bot = new Telegraf<BotContext>(env.botToken);

bot.use(
    Composer.privateChat(
        loadAdmin,
        Composer.branch((ctx) => !!ctx.admin, adminComposer, inbox)
    )
);
bot.catch((err) => console.error("bot error", err));

async function main() {
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
