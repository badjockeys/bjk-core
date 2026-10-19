"use client";

import { useRef, type ReactNode } from "react";

import { Menu } from "./Menu";

/** The ⋯ next to your name: account and sign out. Signing out is a form post (see app/auth/sign-out). */
export function SignOutMenu({ label, children, up }: { label: string; children: ReactNode; up?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <>
      <Menu
        label={label}
        up={up}
        items={[
          { label: "Account", href: "/account" },
          { label: "Sign out", onSelect: () => formRef.current?.requestSubmit() },
        ]}
      >
        {children}
      </Menu>
      <form ref={formRef} action="/auth/sign-out" method="post" hidden />
    </>
  );
}
