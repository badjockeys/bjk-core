"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { blockUser, reportProfile, unblockUser } from "@/actions/profiles";
import { followBlocker } from "@/lib/blockers";
import { profilePath } from "@/lib/paths";

import { MoreIcon } from "./icons";
import { Menu, type MenuItem } from "./Menu";
import { ReportDialog } from "./ReportDialog";
import { copyLink } from "./ShareButton";
import { toast } from "./toast";

/** The ⋯ on someone else's profile: copy link, report, block or unblock. */
export function ProfileMoreMenu({
  handle,
  signedIn,
  blocked,
}: {
  handle: string;
  signedIn: boolean;
  blocked: boolean;
}) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const link = () => new URL(profilePath(handle), window.location.origin).href;

  const items: MenuItem[] = [{ label: "Copy link", onSelect: () => void copyLink(link()) }];
  if (signedIn) {
    items.push({ label: `Report @${handle}`, onSelect: () => setReporting(true) });
    items.push(
      blocked
        ? {
            label: `Unblock @${handle}`,
            onSelect: async () => {
              const result = await unblockUser(handle);
              toast(result.ok ? `You've unblocked @${handle}` : result.error);
              router.refresh();
            },
          }
        : {
            label: `Block @${handle}`,
            danger: true,
            onSelect: async () => {
              if (
                !window.confirm(
                  `Block @${handle}? You won't see their posts or comments, and they can't comment on or react to yours.`,
                )
              ) {
                return;
              }
              const result = await blockUser(handle);
              if (!result.ok) {
                if (!followBlocker(result.blocker)) {
                  toast(result.error);
                }
                return;
              }
              toast(`You've blocked @${handle}`);
              router.refresh();
            },
          },
    );
  } else {
    items.push({ label: `Report @${handle}`, onSelect: () => followBlocker("signin") });
  }

  return (
    <>
      <Menu label="More: report, block or copy link" items={items}>
        <MoreIcon size={20} />
      </Menu>
      {signedIn ? (
        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          what="profile"
          submit={(reason, details) => reportProfile(handle, reason, details)}
        />
      ) : null}
    </>
  );
}
