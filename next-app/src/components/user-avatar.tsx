import type { ConversationsTable } from "@murmur/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fileUrl, initials } from "@/lib/format";

type Props = {
    conversation: Pick<ConversationsTable["$inferSelect"], "firstName" | "lastName" | "photoFileId">;
    size?: "sm" | "default" | "lg";
};

export function UserAvatar({ conversation, size = "lg" }: Props) {
    return (
        <Avatar size={size}>
            {conversation.photoFileId && <AvatarImage src={fileUrl(conversation.photoFileId)} alt="" />}
            <AvatarFallback>{initials(conversation)}</AvatarFallback>
        </Avatar>
    );
}
