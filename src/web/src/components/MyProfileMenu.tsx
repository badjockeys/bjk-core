"use client";

import { useRef } from "react";

import { profilePath } from "@/lib/paths";

import { MoreIcon } from "./icons";
import { Menu } from "./Menu";
import { copyLink } from "./ShareButton";

/**
 * The ⋯ on your own profile (owner, 24 Oct 2026: Account lives here, not in the side nav): account settings, your
 * vault, copy your profile's link, and sign out. Signing out is a form post (see app/auth/sign-out).
 */
export function MyProfileMenu({ handle }: { handle: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <>
      <Menu
        label="Profile options"
        items={[
          { label: "Account settings", href: "/account" },
          { label: "Your vault", href: "/account/vault" },
          {
            label: "Copy link to your profile",
            onSelect: () => void copyLink(new URL(profilePath(handle), window.location.origin).href),
          },
          { label: "Sign out", onSelect: () => formRef.current?.requestSubmit() },
        ]}
      >
        <MoreIcon />
      </Menu>
      <form ref={formRef} action="/auth/sign-out" method="post" hidden />
    </>
  );
}
