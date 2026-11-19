"use client";

import { createContext, useContext, useState } from "react";
import { ReplyIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReplyTarget = { id: string; author: string; preview: string };

type ReplyState = { target: ReplyTarget | null; setTarget: (target: ReplyTarget | null) => void };

const ReplyContext = createContext<ReplyState>({ target: null, setTarget: () => {} });

// Shares the message being replied to between the message list (where it's picked) and the composer (where it's sent).
// Key it by conversation so a pending reply doesn't leak into another chat.
export function ReplyProvider({ children }: { children: React.ReactNode }) {
    const [target, setTarget] = useState<ReplyTarget | null>(null);
    return <ReplyContext value={{ target, setTarget }}>{children}</ReplyContext>;
}

export function useReply(): ReplyState {
    return useContext(ReplyContext);
}

// Wraps a message bubble: double-click or the hover button picks it as the reply target
export function Replyable({
    target,
    outgoing,
    children,
}: {
    target: ReplyTarget | null; // null when the message can't be replied to (not delivered to telegram yet)
    outgoing: boolean;
    children: React.ReactNode;
}) {
    const { setTarget } = useReply();
    if (!target) return children;

    return (
        <div
            className={cn("group flex w-full items-center gap-1", outgoing ? "flex-row-reverse" : "flex-row")}
            onDoubleClick={(event) => {
                // let double-click select text in the bubble
                if (window.getSelection()?.toString()) return;
                event.preventDefault();
                setTarget(target);
            }}
        >
            {children}
            <button
                type="button"
                aria-label="Reply"
                title="Reply"
                onClick={() => setTarget(target)}
                className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
            >
                <ReplyIcon className="size-4" />
            </button>
        </div>
    );
}
