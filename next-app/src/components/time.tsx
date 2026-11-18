"use client";

// Formats in the viewer's timezone; server render may differ, hence suppressHydrationWarning
export function Time({ date, relative = false }: { date: Date; relative?: boolean }) {
    const today = new Date().toDateString() === date.toDateString();
    const text =
        relative && !today
            ? date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
            : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

    return (
        <time dateTime={date.toISOString()} title={date.toLocaleString()} suppressHydrationWarning>
            {text}
        </time>
    );
}
