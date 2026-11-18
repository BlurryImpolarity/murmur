import type { Context } from "telegraf-hardened";
import type { AdminsTable } from "@murmur/db";

export interface BotContext extends Context {
    admin?: AdminsTable["$inferSelect"];
}
