"use server";

import { headers } from "next/headers";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { isReason, PUBLIC_REASONS } from "@/lib/reasons";
import type { ReportReason, ReportReceipt } from "@/lib/types";

import { run } from "./run";

export interface PublicReportForm {
  target: string;
  reason: ReportReason;
  details: string;
  name: string;
  email: string;
  consent: boolean;
  captchaToken: string;
}

/** The public "Report content / I'm in this clip" form. No account needed; Cloudflare Turnstile keeps bots out. */
export async function submitPublicReport(form: PublicReportForm): Promise<ActionResult<ReportReceipt>> {
  if (!isReason(form.reason, PUBLIC_REASONS)) {
    return {
      ok: false,
      error: "Choose what the problem is.",
      fieldErrors: { reason: ["Choose what the problem is."] },
    };
  }
  if (!form.captchaToken) {
    return { ok: false, error: "Please wait for the security check to finish, then send the report again." };
  }
  // Behind Cloudflare the visitor's address is in CF-Connecting-IP; the API passes it to Turnstile.
  const incoming = await headers();
  const clientIp =
    incoming.get("cf-connecting-ip") ?? incoming.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return run(() =>
    api().reports.submitPublic(
      {
        target: form.target.trim(),
        commentId: null,
        reason: form.reason,
        details: form.details.trim() || null,
        reporterName: form.name.trim(),
        reporterEmail: form.email.trim(),
        consent: form.consent,
      },
      form.captchaToken,
      clientIp,
    ),
  );
}
