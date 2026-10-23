"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { leaveCommunity, reportCommunity } from "@/actions/communities";
import { communityPath } from "@/lib/communities";

import { MoreIcon } from "../icons";
import { Menu, type MenuItem } from "../Menu";
import { ReportDialog } from "../ReportDialog";
import { copyLink } from "../ShareButton";
import { toast } from "../toast";

/** The ⋯ on a community: copy the link, manage it (admins and moderators), leave, or report it. */
export function CommunityMenu({
  slug,
  name,
  isMember,
  canModerate,
}: {
  slug: string;
  name: string;
  isMember: boolean;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const items: MenuItem[] = [
    {
      label: "Copy link",
      onSelect: () => void copyLink(new URL(communityPath(slug), window.location.origin).href),
    },
  ];
  if (canModerate) {
    items.push({ label: "Manage community", href: `${communityPath(slug)}/manage` });
  }
  if (isMember) {
    items.push({
      label: "Leave community",
      danger: true,
      onSelect: async () => {
        if (!window.confirm(`Leave ${name}?`)) {
          return;
        }
        const result = await leaveCommunity(slug);
        if (!result.ok) {
          toast(result.error);
          return;
        }
        toast(`You've left ${name}`);
        router.refresh();
      },
    });
  }
  items.push({ label: "Report community", onSelect: () => setReporting(true) });

  return (
    <>
      <Menu label="More: manage, leave or report" items={items} buttonClassName="icon-btn">
        <MoreIcon />
      </Menu>
      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        what="community"
        submit={(reason, details) => reportCommunity(slug, reason, details)}
      />
    </>
  );
}
