// Usage: npm run admin:create -- <login> <password> [telegramUserId]
import { config } from "dotenv";
import { createDb } from "../client";
import { hashPassword } from "../password";
import { adminsTable } from "../schema";

config({ path: ["../../.env", ".env"], quiet: true });

const [login, password, telegramUserId] = process.argv.slice(2);
if (!login || !password) {
    console.error("Usage: create-admin <login> <password> [telegramUserId]");
    process.exit(1);
}

const db = createDb(process.env.DATABASE_URL!);
const passwordHash = await hashPassword(password);
const values = { login, passwordHash, telegramUserId: telegramUserId ? Number(telegramUserId) : null };

await db.insert(adminsTable).values(values).onConflictDoUpdate({ target: adminsTable.login, set: values });
console.log(`admin "${login}" saved`);
await db.$client.end();
