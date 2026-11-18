import { config } from "dotenv";

config({ path: ["../.env", ".env"], quiet: true });

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
}

export const env = {
    botToken: required("BOT_TOKEN"),
    databaseUrl: required("DATABASE_URL"),
    // outbox polls at the default interval, drops to the min when there's traffic, then backs off again
    outboxIntervalMs: Number(process.env.OUTBOX_INTERVAL_MS || 5000),
    outboxMinIntervalMs: Number(process.env.OUTBOX_MIN_INTERVAL_MS || 500),
    // group where admins can reply via /reply, e.g. -1001234567890
    groupChatId: process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined,
    // how often admins get a summary of new messages; 0 or unset disables it
    notifyIntervalMs: Number(process.env.NOTIFY_INTERVAL_MS || 0),
};