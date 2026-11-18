"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders server components periodically to pick up new messages and delivery statuses
export function AutoRefresh({ intervalMs = 3000 }: { intervalMs?: number }) {
    const router = useRouter();

    useEffect(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") router.refresh();
        }, intervalMs);
        return () => clearInterval(timer);
    }, [router, intervalMs]);

    return null;
}
