"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { removeDiscussion, removeReply, reportDiscussion, reportReply } from "@/actions/communities";
import { communityPath } from "@/lib/communities";

import { MoreIcon } from "../icons";
import { Menu, type MenuItem } from "../Menu";
import { ReportDialog } from "../ReportDialog";
import { toast } from "../toast";

/** The ⋯ on a discussion or a reply: remove it (its author, admins and moderators), or report it. */
export function ContentActions({
  slug,
  discussionId,
  replyId,
  canRemove,
  isMine,
}: {
  slug: string;
  discussionId: string;
  replyId?: string;
  canRemove: boolean;
  isMine: boolean;
}) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const what = replyId ? "reply" : "discussion";
  const items: MenuItem[] = [];
  if (canRemove) {
    items.push({
      label: `Remove ${what}`,
      danger: true,
      onSelect: async () => {
        if (!window.confirm(`Remove this ${what}? This can't be undone.`)) {
          return;
        }
        const result = replyId
          ? await removeReply(slug, discussionId, replyId)
          : await removeDiscussion(slug, discussionId);
        if (!result.ok) {
          toast(result.error);
          return;
        }
        toast(`The ${what} was removed`);
        if (replyId) {
          router.refresh();
        } else {
          router.push(`${communityPath(slug)}?tab=discussions`);
        }
      },
    });
  }
  if (!isMine) {
    items.push({ label: `Report ${what}`, onSelect: () => setReporting(true) });
  }
  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <Menu
        label={`More: ${canRemove ? "remove or " : ""}report this ${what}`}
        items={items}
        buttonClassName="icon-btn"
      >
        <MoreIcon />
      </Menu>
      {isMine ? null : (
        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          what={what}
          submit={(reason, details) =>
            replyId ? reportReply(replyId, reason, details) : reportDiscussion(discussionId, reason, details)
          }
        />
      )}
    </>
  );
}
