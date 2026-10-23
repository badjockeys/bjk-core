"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deletePost, reportPost, setCommentSetting } from "@/actions/posts";
import { blockUser } from "@/actions/profiles";
import { followBlocker } from "@/lib/blockers";
import { postPath } from "@/lib/paths";
import { shareCaption, type ShareCaptionPost } from "@/lib/share-video";
import type { CommentSetting } from "@/lib/types";

import { ShareToCommunityDialog } from "./communities/ShareToCommunityDialog";
import { MoreIcon } from "./icons";
import { Menu, type MenuItem } from "./Menu";
import { ReportDialog } from "./ReportDialog";
import { ShareVideoDialog } from "./ShareVideoDialog";
import { copyLink } from "./ShareButton";
import { toast } from "./toast";

/**
 * The ⋯ on a post: copy the link; report it or block its author; or, on your own post, share it to your communities,
 * download the video for TikTok, Reels and Shorts, turn comments off or on, and delete it.
 */
export function PostMoreMenu({
  postId,
  title,
  authorHandle,
  isMine,
  signedIn,
  className = "icon-btn tw-more",
  afterDelete = "refresh",
  commentSetting,
  shareVideo,
}: {
  postId: string;
  title: string;
  authorHandle: string | null;
  isMine: boolean;
  signedIn: boolean;
  className?: string;
  afterDelete?: "refresh" | "home";
  /** Your own post: who can comment now, for the "Turn off comments" or "Turn on comments" item. */
  commentSetting?: CommentSetting;
  /** Your own video post that can be shared (see `shareableVideoId`): the video, and what the caption is made from. */
  shareVideo?: { mediaId: string; post: ShareCaptionPost } | null;
}) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharingToCommunity, setSharingToCommunity] = useState(false);
  const link = () => new URL(postPath(postId), window.location.origin).href;

  const items: MenuItem[] = [{ label: "Copy link", onSelect: () => void copyLink(link()) }];
  if (isMine) {
    items.push({ label: "Share to a community", onSelect: () => setSharingToCommunity(true) });
  }
  if (isMine && shareVideo) {
    items.push({ label: "Download for TikTok, Reels and Shorts", onSelect: () => setSharing(true) });
  }
  if (isMine && commentSetting) {
    // Who can comment: everyone, only people you follow, or nobody. The ones already there always stay.
    const change = (setting: CommentSetting, done: string) => async () => {
      const result = await setCommentSetting(postId, setting);
      if (!result.ok) {
        toast(result.error);
        return;
      }
      toast(done);
      router.refresh();
    };
    if (commentSetting !== "Everyone") {
      items.push({
        label: commentSetting === "Off" ? "Turn on comments" : "Let everyone comment",
        onSelect: change("Everyone", "Everyone can comment"),
      });
    }
    if (commentSetting !== "Following") {
      items.push({
        label: "Only people I follow can comment",
        onSelect: change("Following", "Only people you follow can comment now"),
      });
    }
    if (commentSetting !== "Off") {
      items.push({
        label: "Turn off comments",
        onSelect: change("Off", "Comments are off. The ones already there stay."),
      });
    }
  }
  if (isMine) {
    items.push({
      label: "Delete post",
      danger: true,
      onSelect: async () => {
        if (
          !window.confirm(`Delete "${title}"? Its photos and video are deleted too. This can't be undone.`)
        ) {
          return;
        }
        const result = await deletePost(postId);
        if (!result.ok) {
          toast(result.error);
          return;
        }
        toast("Post deleted");
        if (afterDelete === "home") {
          router.push("/");
        }
        router.refresh();
      },
    });
  } else if (signedIn) {
    items.push({ label: "Report post", onSelect: () => setReporting(true) });
    if (authorHandle) {
      items.push({
        label: `Block @${authorHandle}`,
        onSelect: async () => {
          if (
            !window.confirm(
              `Block @${authorHandle}? You won't see their posts or comments, and they can't comment on or react to yours.`,
            )
          ) {
            return;
          }
          const result = await blockUser(authorHandle);
          if (!result.ok) {
            if (!followBlocker(result.blocker)) {
              toast(result.error);
            }
            return;
          }
          toast(`You've blocked @${authorHandle}`);
          router.refresh();
        },
      });
    }
  } else {
    // Visitors use the public report form, which needs no account.
    items.push({
      label: "Report post",
      onSelect: () => router.push(`/report?post=${encodeURIComponent(link())}`),
    });
  }

  return (
    <>
      <Menu
        label={isMine ? "Edit or delete your post" : "More: report or copy link"}
        items={items}
        buttonClassName={className}
      >
        <MoreIcon />
      </Menu>
      {isMine && shareVideo && sharing ? (
        <ShareVideoDialog
          mediaId={shareVideo.mediaId}
          caption={shareCaption(shareVideo.post, link())}
          open
          onClose={() => setSharing(false)}
        />
      ) : null}
      {isMine && sharingToCommunity ? (
        <ShareToCommunityDialog postId={postId} onClose={() => setSharingToCommunity(false)} />
      ) : null}
      {signedIn && !isMine ? (
        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          what="post"
          submit={(reason, details) => reportPost(postId, reason, details)}
        />
      ) : null}
    </>
  );
}
