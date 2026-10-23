import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  allowanceLabel,
  barPercent,
  cardMax,
  historyFor,
  mapHref,
  parseMapStart,
  pointValue,
  type ChatEntry,
} from "@/lib/chat";
import type { ChatAnswerDto, ChatReplyDto, ChatUsageDto } from "@/lib/types";
import { ANONYMOUS, type Viewer } from "@/lib/viewer";

const actions = vi.hoisted(() => ({ getChatUsage: vi.fn(), askChat: vi.fn() }));
vi.mock("@/actions/chat", () => ({ getChatUsage: actions.getChatUsage, askChat: actions.askChat }));

import { AskBadJockeys, AskButton } from "@/components/AskBadJockeys";
import { ChatCard } from "@/components/ChatCard";

const usage = (over: Partial<ChatUsageDto> = {}): ChatUsageDto => ({
  plan: "premium",
  canAsk: true,
  limit: 20,
  used: 2,
  remaining: 18,
  resetsAt: "2026-10-24T00:00:00+01:00",
  historyFrom: "2025-10-23",
  exampleQuestions: [
    "How many incidents have there been in Prescot this month?",
    "Worst roads for tailgating in Prescot",
    "Is pavement parking getting worse in Prescot?",
    "What time of day is worst for speeding?",
  ],
  paused: false,
  ...over,
});

const answer = (over: Partial<ChatAnswerDto> = {}): ChatAnswerDto => ({
  text: "There were 42 reports in Prescot this month.",
  kind: "Answer",
  card: {
    type: "Number",
    title: null,
    valueLabel: "reports",
    points: [n("Reports", 42)],
    columns: null,
    rows: null,
    hiddenRows: 0,
  },
  map: null,
  suggestions: ["Which roads in Prescot are worst?"],
  ...over,
});

function n(label: string, value: number | null, hidden = false) {
  return { label, value, hidden, latitude: null, longitude: null };
}

const entry = (question: string, token: string | null, a: ChatAnswerDto | null = answer()): ChatEntry => ({
  id: question,
  question,
  answer: a,
  token,
  error: null,
});

describe("chat helpers", () => {
  it("sends only answered turns with tokens, the last six, oldest first", () => {
    const entries = [
      entry("blocked", null),
      ...Array.from({ length: 7 }, (_, i) => entry(`q${i}`, `t${i}`)),
      entry("pending", "x", null),
    ];

    const history = historyFor(entries);

    expect(history.map((h) => h.question)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6"]);
    expect(history[0]).toEqual({ question: "q1", answer: answer().text, token: "t1" });
  });

  it("describes the allowance", () => {
    expect(allowanceLabel(usage())).toBe("18 questions left today");
    expect(allowanceLabel(usage({ remaining: 1 }))).toBe("1 question left today");
    expect(allowanceLabel(usage({ remaining: 0 }))).toBe("No questions left today");
    expect(allowanceLabel(usage({ paused: true }))).toBe("Paused until midnight");
    expect(allowanceLabel(usage({ canAsk: false, plan: "free", limit: 0 }))).toBe("Part of Premium");
  });

  it("shows hidden figures as fewer than 3 and scales bars to the largest shown figure", () => {
    expect(pointValue(n("A", 1284))).toBe("1,284");
    expect(pointValue(n("A", null, true))).toBe("fewer than 3");
    const card = { points: [n("A", 40), n("B", 10), n("C", null, true)] };
    expect(cardMax(card)).toBe(40);
    expect(barPercent(card.points[1]!, 40)).toBe(25);
    expect(barPercent(card.points[2]!, 40)).toBe(2);
    expect(cardMax({ points: [] })).toBe(1);
  });

  it("links to the map with a UK centre and known types only", () => {
    expect(
      mapHref({
        latitude: 53.4312,
        longitude: -2.8011,
        zoom: 12,
        subcategories: ["Tailgating", "Nonsense", "PhoneInHand"],
      }),
    ).toBe("/map?lat=53.431&lng=-2.801&zoom=12&types=Tailgating%2CPhoneInHand");
    expect(mapHref({ latitude: 40.7, longitude: -74, zoom: 10, subcategories: [] })).toBe("/map");
    expect(mapHref(null)).toBeNull();
  });

  it("reads the map's starting point back, ignoring anything odd", () => {
    expect(parseMapStart({ lat: "53.431", lng: "-2.801", zoom: "12", types: "Tailgating,Nonsense" })).toEqual(
      {
        centre: [53.431, -2.801],
        zoom: 12,
        types: ["Tailgating"],
      },
    );
    expect(parseMapStart({ lat: "999", lng: "0", zoom: "40" })).toEqual({
      centre: null,
      zoom: null,
      types: [],
    });
    expect(parseMapStart({})).toEqual({ centre: null, zoom: null, types: [] });
  });
});

describe("ChatCard", () => {
  it("draws places with hidden counts and a note", () => {
    render(
      <ChatCard
        card={{
          type: "Places",
          title: "Worst roads for tailgating",
          valueLabel: "reports",
          points: [n("A57 Warrington Road, Prescot", 12), n("High Street, Prescot", null, true)],
          columns: null,
          rows: null,
          hiddenRows: 1,
        }}
      />,
    );

    expect(screen.getByText("Worst roads for tailgating")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("fewer than 3")).toBeInTheDocument();
    expect(screen.getByText(/1 row had fewer than 3 reports/)).toBeInTheDocument();
  });

  it("draws tables, with hidden cells spelled out", () => {
    render(
      <ChatCard
        card={{
          type: "Table",
          title: null,
          valueLabel: null,
          points: [],
          columns: ["Town", "Reports"],
          rows: [
            ["Prescot", "31"],
            ["Rainhill", "<3"],
          ],
          hiddenRows: 0,
        }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Town" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "fewer than 3" })).toBeInTheDocument();
  });
});

describe("Ask Bad Jockeys", () => {
  const premium: Viewer = {
    ...ANONYMOUS,
    signedIn: true,
    userId: "u1",
    email: "me@example.com",
    hasProfile: true,
  };

  beforeEach(() => {
    sessionStorage.clear();
    actions.getChatUsage.mockReset();
    actions.askChat.mockReset();
  });

  async function openWindow(viewer: Viewer = premium) {
    render(
      <>
        <AskButton variant="nav" />
        <AskBadJockeys viewer={viewer} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ask Bad Jockeys" }));
  }

  it("shows the member's own example questions and answers one", async () => {
    actions.getChatUsage.mockResolvedValue({ ok: true, data: usage() });
    const reply: ChatReplyDto = {
      answer: answer(),
      usage: usage({ used: 3, remaining: 17 }),
      turnToken: "tok",
    };
    actions.askChat.mockResolvedValue({ ok: true, data: reply });

    await openWindow();
    const example = await screen.findByRole("button", {
      name: "How many incidents have there been in Prescot this month?",
    });
    await userEvent.click(example);

    expect(actions.askChat).toHaveBeenCalledWith(
      "How many incidents have there been in Prescot this month?",
      [],
    );
    expect(await screen.findByText("There were 42 reports in Prescot this month.")).toBeInTheDocument();
    expect(screen.getByText("17 questions left today")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Which roads in Prescot are worst?" })).toBeEnabled();
  });

  it("sends earlier answered turns with the next question", async () => {
    actions.getChatUsage.mockResolvedValue({ ok: true, data: usage() });
    actions.askChat.mockResolvedValue({
      ok: true,
      data: { answer: answer(), usage: usage(), turnToken: "tok" },
    });

    await openWindow();
    await screen.findByText("18 questions left today");
    await userEvent.type(screen.getByLabelText("Your question"), "How many in Prescot?{Enter}");
    await screen.findByText("There were 42 reports in Prescot this month.");
    await userEvent.type(screen.getByLabelText("Your question"), "And last month?{Enter}");

    await waitFor(() => expect(actions.askChat).toHaveBeenCalledTimes(2));
    expect(actions.askChat).toHaveBeenLastCalledWith("And last month?", [
      { question: "How many in Prescot?", answer: answer().text, token: "tok" },
    ]);
  });

  it("locks the chat for Free members, still showing examples for their area", async () => {
    actions.getChatUsage.mockResolvedValue({
      ok: true,
      data: usage({ plan: "free", canAsk: false, limit: 0, used: 0, remaining: 0, historyFrom: null }),
    });

    await openWindow();

    expect(await screen.findByText("Ask Bad Jockeys is part of Premium")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Worst roads for tailgating in Prescot" })).toBeDisabled();
    expect(screen.getByLabelText("Your question")).toBeDisabled();
    expect(screen.getByRole("link", { name: "See Premium" })).toHaveAttribute("href", "/premium");
  });

  it("says when the day's questions are used up", async () => {
    actions.getChatUsage.mockResolvedValue({ ok: true, data: usage({ remaining: 1, used: 19 }) });
    actions.askChat.mockResolvedValue({
      ok: false,
      problem: "limit",
      error: "That's your 20 questions for today. You can ask again from midnight.",
    });

    await openWindow();
    await screen.findByText("1 question left today");
    actions.getChatUsage.mockResolvedValue({ ok: true, data: usage({ remaining: 0, used: 20 }) });
    await userEvent.type(screen.getByLabelText("Your question"), "How many?{Enter}");

    expect(await screen.findByText(/That's your 20 questions for today/)).toBeInTheDocument();
    expect(await screen.findByText("No questions left today")).toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toBeDisabled();
  });

  it("keeps the conversation when the page changes, but not for another account", async () => {
    actions.getChatUsage.mockResolvedValue({ ok: true, data: usage() });
    actions.askChat.mockResolvedValue({
      ok: true,
      data: { answer: answer(), usage: usage(), turnToken: "tok" },
    });

    await openWindow();
    await screen.findByText("18 questions left today");
    await userEvent.type(screen.getByLabelText("Your question"), "How many in Prescot?{Enter}");
    await screen.findByText("There were 42 reports in Prescot this month.");
    const saved = sessionStorage.getItem("bjk-ask");
    expect(saved).toContain("How many in Prescot?");

    // Another member in the same tab starts empty.
    document.body.innerHTML = "";
    await act(async () => {
      render(<AskBadJockeys viewer={{ ...premium, userId: "u2" }} />);
    });
    expect(screen.queryByText("How many in Prescot?")).not.toBeInTheDocument();
  });
});
