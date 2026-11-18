import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ["../../.env", ".env"], quiet: true });

export default defineConfig({
    out: "./drizzle",
    schema: "./schema.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
