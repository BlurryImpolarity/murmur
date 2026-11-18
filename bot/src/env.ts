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
    outboxIntervalMs: Number(process.env.OUTBOX_INTERVAL_MS ?? 2000),
};