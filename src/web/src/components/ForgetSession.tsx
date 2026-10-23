"use client";

import { useEffect, useRef } from "react";

import { forgetRefusedSession } from "@/actions/session";

/**
 * Shown when the API refused the session's token: the page has already rendered signed out, and this removes the
 * dead session cookie (cookies can't be changed while a page renders, only in a server action).
 */
export function ForgetSession() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) {
      return;
    }
    done.current = true;
    void forgetRefusedSession();
  }, []);
  return null;
}
