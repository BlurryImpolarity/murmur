import type { MessageEntity } from "@murmur/db";

// Renders telegram text + entities. Telegram guarantees entities either nest fully or don't overlap,
// and offsets are UTF-16 code units, which matches JS string indexing.
export function FormattedText({ text, entities }: { text: string; entities: MessageEntity[] | null }) {
    const sorted = [...(entities ?? [])].sort((a, b) => a.offset - b.offset || b.length - a.length);
    return <span className="break-words whitespace-pre-wrap">{render(text, sorted, 0, text.length)}</span>;
}

function render(text: string, entities: MessageEntity[], start: number, end: number): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    let position = start;
    let i = 0;

    while (i < entities.length) {
        const entity = entities[i];
        const entityEnd = entity.offset + entity.length;
        if (entity.offset > position) nodes.push(text.slice(position, entity.offset));

        // everything starting before this entity ends is nested inside it
        let j = i + 1;
        while (j < entities.length && entities[j].offset < entityEnd) j++;

        const children = render(text, entities.slice(i + 1, j), entity.offset, entityEnd);
        nodes.push(wrap(entity, text.slice(entity.offset, entityEnd), children, `${entity.offset}-${i}`));
        position = entityEnd;
        i = j;
    }
    if (position < end) nodes.push(text.slice(position, end));
    return nodes;
}

function wrap(entity: MessageEntity, raw: string, children: React.ReactNode[], key: string): React.ReactNode {
    const link = (href: string) => (
        <a key={key} href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {children}
        </a>
    );

    switch (entity.type) {
        case "bold":
            return <strong key={key}>{children}</strong>;
        case "italic":
            return <em key={key}>{children}</em>;
        case "underline":
            return <u key={key}>{children}</u>;
        case "strikethrough":
            return <s key={key}>{children}</s>;
        case "spoiler":
            return (
                <span key={key} className="rounded-sm blur-[4px] transition hover:blur-none">
                    {children}
                </span>
            );
        case "code":
            return (
                <code key={key} className="rounded-sm bg-foreground/10 px-1 font-mono text-[0.9em]">
                    {children}
                </code>
            );
        case "pre":
            return (
                <pre key={key} className="my-1 overflow-x-auto rounded-md bg-foreground/10 p-2 font-mono text-[0.9em]">
                    <code>{children}</code>
                </pre>
            );
        case "blockquote":
        case "expandable_blockquote":
            return (
                <blockquote key={key} className="my-1 border-l-2 border-current/40 pl-2">
                    {children}
                </blockquote>
            );
        case "text_link":
            return link(entity.url!);
        case "url":
            return link(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
        case "email":
            return link(`mailto:${raw}`);
        case "phone_number":
            return link(`tel:${raw}`);
        case "mention":
            return link(`https://t.me/${raw.slice(1)}`);
        case "text_mention":
            return link(`tg://user?id=${entity.user!.id}`);
        default:
            // hashtag, cashtag, bot_command, custom_emoji, date_time: plain text
            return <span key={key}>{children}</span>;
    }
}
