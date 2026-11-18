import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless session: `<adminId>.<expiresAt>.<hmac>`; kept free of next/headers so proxy can use it

export const SESSION_COOKIE = "murmur_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function sign(payload: string): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error("SESSION_SECRET is not set");
    return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(adminId: string): string {
    const payload = `${adminId}.${Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS}`;
    return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
    if (!token) return null;
    const separator = token.lastIndexOf(".");
    const payload = token.slice(0, separator);
    const signature = Buffer.from(token.slice(separator + 1));
    const expected = Buffer.from(sign(payload));
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;

    const [adminId, expiresAt] = payload.split(".");
    if (!adminId || Number(expiresAt) < Date.now() / 1000) return null;
    return adminId;
}
