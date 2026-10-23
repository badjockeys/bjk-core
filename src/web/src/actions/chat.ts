"use server";

import { api, ApiError } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { getAccessToken } from "@/lib/auth";
import { MAX_QUESTION, type ChatProblem } from "@/lib/chat";
import { logRefusedToken } from "@/lib/refused-token";
import type { ChatReplyDto, ChatTurn, ChatUsageDto } from "@/lib/types";

import { run } from "./run";

/** The 429 code when a member has had too many blocked questions today. */
const CHAT_PAUSED = "chat_paused";

/** Asking failed: the message to show, why (so the window can offer the right next step) and, for limits, until when. */
export type AskResult =
  | { ok: true; data: ChatReplyDto }
  | { ok: false; error: string; problem: ChatProblem; resetsAt?: string };

/**
 * Today's allowance and the example questions, tailored by the API to the caller's home area (Free and signed-out
 * callers get canAsk false, for the locked preview).
 */
export async function getChatUsage(): Promise<ActionResult<ChatUsageDto>> {
  const token = await getAccessToken();
  return run(() => api().chat.usage(token));
}

/** Ask Bad Jockeys a question. `history` is the window's earlier answered turns (the API checks their tokens). */
export async function askChat(question: string, history: ChatTurn[]): Promise<AskResult> {
  const text = question.trim().slice(0, MAX_QUESTION);
  if (!text) {
    return { ok: false, error: "Type a question first.", problem: "other" };
  }
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, error: "Sign in to ask Bad Jockeys.", problem: "signin" };
  }

  // Only well-formed turns, and only as many as the API reads: anything else would be dropped there anyway.
  const turns = (Array.isArray(history) ? history : [])
    .filter((t) => t && typeof t.question === "string" && typeof t.answer === "string" && typeof t.token === "string")
    .slice(-6)
    .map((t) => ({ question: t.question.slice(0, MAX_QUESTION), answer: t.answer.slice(0, 2000), token: t.token }));

  try {
    return { ok: true, data: await api().chat.ask(token, text, turns) };
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error("Ask Bad Jockeys failed", error instanceof Error ? error.message : error);
      return { ok: false, error: "Something went wrong. Please try again.", problem: "other" };
    }
    const resetsAt = typeof error.problem?.resetsAt === "string" ? error.problem.resetsAt : undefined;
    if (error.status === 401) {
      logRefusedToken(error);
      return { ok: false, error: "Sign in again to ask Bad Jockeys.", problem: "signin" };
    }
    if (error.isDailyLimit) {
      return { ok: false, error: error.userMessage, problem: "limit", resetsAt };
    }
    if (error.status === 403) {
      return { ok: false, error: error.userMessage, problem: "premium" };
    }
    if (error.status === 429 && error.code === CHAT_PAUSED) {
      return { ok: false, error: error.userMessage, problem: "paused" };
    }
    if (error.status === 503 || error.status === 504 || error.status === 502) {
      return {
        ok: false,
        error: error.problem?.detail || "Ask Bad Jockeys is busy right now. Try again in a minute; that question didn't count.",
        problem: "busy",
      };
    }
    return { ok: false, error: error.userMessage, problem: "other" };
  }
}
