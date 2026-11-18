import "dotenv/config";
import { Telegraf } from "telegraf-hardened";

const bot = new Telegraf(process.env.BOT_TOKEN!);

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
