import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostDto, PostMediaDto, VoteSummaryDto } from "@/lib/types";
import { ANONYMOUS, type Viewer } from "@/lib/viewer";

const actions = vi.hoisted(() => ({
  reactToPost: vi.fn(),
  reportPost: vi.fn(),
  deletePost: vi.fn(),
  loadPosts: vi.fn(),
  blockUser: vi.fn(),
  castVote: vi.fn(),
  savePost: vi.fn(),
  followPost: vi.fn(),
}));

vi.mock("@/actions/posts", () => ({
  reactToPost: actions.reactToPost,
  reportPost: actions.reportPost,
  deletePost: actions.deletePost,
  loadPosts: actions.loadPosts,
}));
vi.mock("@/actions/profiles", () => ({ blockUser: actions.blockUser }));
vi.mock("@/actions/engagement", () => ({
  castVote: actions.castVote,
  savePost: actions.savePost,
  followPost: actions.followPost,
  recordViews: vi.fn(),
  recordShare: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));

import { PostCard } from "@/components/PostCard";
import { ReactionBar } from "@/components/ReactionBar";
import { ReportDialog } from "@/components/ReportDialog";
import { SaveButton } from "@/components/SaveButton";
import { VotePanel } from "@/components/VotePanel";

function photo(mediaId: string, playbackUrl: string, thumbnailUrl: string): PostMediaDto {
  return {
    mediaId,
    mediaType: "Image",
    playbackUrl,
    thumbnailUrl,
    durationSeconds: null,
    width: 2048,
    height: 1536,
    previewUrl: null,
    isBlurred: false,
    linksExpireAt: null,
    feedUrl: null,
  };
}

const post: PostDto = {
  id: "8f2e1c3a-0000-4000-8000-000000000001",
  author: {
    id: "author-1",
    handle: "dashcam_dave",
    displayName: "Dashcam Dave",
    avatarUrl: null,
    roadUser: null,
  },
  title: "Parked across two disabled bays, again",
  description: "Third time this week.",
  category: "BadParking",
  incidentAt: "2026-10-18T07:05:00Z",
  location: { latitude: 53.81, longitude: -1.6, placeName: "Asda, Kirkstall, Leeds" },
  status: "Published",
  hiddenReason: null,
  media: [
    photo("m1", "/1.webp", "/1t.webp"),
    photo("m2", "/2.webp", "/2t.webp"),
    photo("m3", "/3.webp", "/3t.webp"),
  ],
  reactions: { Like: 9, Angry: 17, Shocked: 4, Laugh: 1 },
  myReaction: null,
  commentCount: 7,
  createdAt: "2026-10-18T07:14:00Z",
  updatedAt: null,
  isSensitive: false,
  commentsRequireSignIn: false,
  mediaState: "Ready",
  mediaFailureReason: null,
  requiresAgeVerification: false,
  sensitiveSource: "None",
  types: null,
  passengers: null,
  vehicle: null,
  reportedToPolice: null,
  commentSetting: "Everyone",
  vote: null,
  isFollowing: false,
  isSaved: false,
  isProcessing: false,
};

const member: Viewer = {
  ...ANONYMOUS,
  signedIn: true,
  userId: "me",
  ageVerified: true,
  emailVerified: true,
  hasProfile: true,
  handle: "roadhog",
  displayName: "Road Hog",
};

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset());
});

describe("PostCard", () => {
  it("shows the author, title, place, category, photo grid and counts", () => {
    render(<PostCard post={post} viewer={ANONYMOUS} />);

    expect(screen.getByRole("link", { name: "Dashcam Dave" })).toHaveAttribute("href", "/@dashcam_dave");
    expect(screen.getByText("Parked across two disabled bays, again")).toBeInTheDocument();
    expect(screen.getByText("Asda, Kirkstall, Leeds")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bad parking" })).toHaveAttribute("href", "/c/bad-parking");
    expect(screen.getByRole("link", { name: "3 photos" })).toHaveAttribute("href", `/p/${post.id}`);
    expect(screen.getByRole("link", { name: "7 comments" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^31 reactions/ })).toBeInTheDocument();
  });

  it("shows every type of bad driving as a tag, main first", () => {
    const tagged: PostDto = { ...post, category: "Tailgating", types: ["Tailgating", "RoadRage"] };
    render(<PostCard post={tagged} viewer={ANONYMOUS} />);

    const tags = within(screen.getByRole("list", { name: "Types of bad driving" })).getAllByRole("link");
    expect(tags.map((t) => t.textContent)).toEqual(["Tailgating", "Road rage"]);
    expect(tags[1]).toHaveAttribute("href", "/c/road-rage");
  });

  it("shows the author a processing badge while the media are being processed", () => {
    render(
      <PostCard
        post={{ ...post, author: { ...post.author, id: "me" }, media: [], mediaState: "Pending" }}
        viewer={member}
      />,
    );
    expect(screen.getByText(/Processing: only you can see this/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit or delete your post" })).toBeInTheDocument();
  });

  it("likes the post from the reactions count", async () => {
    actions.reactToPost.mockResolvedValue({ ok: true, data: undefined });
    render(<PostCard post={post} viewer={member} />);

    await userEvent.click(screen.getByRole("button", { name: /^31 reactions/ }));

    expect(actions.reactToPost).toHaveBeenCalledWith(post.id, "Like");
    expect(screen.getByRole("button", { name: /^32 reactions/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers report and block to members, in the ⋯ menu", async () => {
    render(<PostCard post={post} viewer={member} />);

    await userEvent.click(screen.getByRole("button", { name: "More: report or copy link" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Report post" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Block @dashcam_dave" })).toBeInTheDocument();
  });
});

describe("sensitive posts", () => {
  const sensitive: PostDto = {
    ...post,
    isSensitive: true,
    requiresAgeVerification: true,
    media: [
      {
        mediaId: "m1",
        mediaType: "Image",
        playbackUrl: null,
        thumbnailUrl: null,
        durationSeconds: null,
        width: 2048,
        height: 1536,
        previewUrl: "/1-preview.webp",
        isBlurred: true,
        linksExpireAt: null,
        feedUrl: null,
      },
    ],
  };

  it("show visitors the blurred preview and ask them to sign in", () => {
    const { container } = render(<PostCard post={sensitive} viewer={ANONYMOUS} />);
    expect(screen.getByText("Sensitive content")).toBeInTheDocument();
    expect(screen.getByText("Injuries or a serious crash")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to view" })).toHaveAttribute(
      "href",
      `/auth/sign-in?returnTo=${encodeURIComponent(`/p/${post.id}`)}`,
    );
    expect(container.querySelector("img.sensitive-preview")?.getAttribute("src")).toBe("/1-preview.webp");
  });

  it("offer signed-in members the age check", () => {
    render(<PostCard post={sensitive} viewer={{ ...member, ageVerified: false }} />);
    expect(screen.getByRole("link", { name: "Verify your age to view" })).toHaveAttribute(
      "href",
      `/auth/check-age?returnTo=${encodeURIComponent(`/p/${post.id}`)}`,
    );
  });

  it("use the 1080 px feed copy of photos in the feed", () => {
    const { container } = render(
      <PostCard
        post={{ ...post, media: [{ ...post.media[0]!, feedUrl: "/1-feed.webp" }] }}
        viewer={ANONYMOUS}
      />,
    );
    expect(container.innerHTML).toContain('src="/1-feed.webp"');
    expect(container.innerHTML).not.toContain('src="/1.webp"');
  });
});

describe("ReactionBar", () => {
  it("switches the reaction and puts it back if the server refuses", async () => {
    actions.reactToPost.mockResolvedValueOnce({ ok: true, data: undefined });
    actions.reactToPost.mockResolvedValueOnce({ ok: false, error: "Nope" });
    render(<ReactionBar postId="p1" counts={{ Like: 9, Angry: 17 }} mine={null} signedIn />);

    await userEvent.click(screen.getByRole("button", { name: "Angry 17" }));
    expect(screen.getByRole("button", { name: "Angry 18" })).toHaveAttribute("aria-pressed", "true");
    expect(actions.reactToPost).toHaveBeenLastCalledWith("p1", "Angry");
    await waitFor(() => expect(screen.getByRole("button", { name: "Like 9" })).toBeEnabled());

    await userEvent.click(screen.getByRole("button", { name: "Like 9" }));
    expect(actions.reactToPost).toHaveBeenLastCalledWith("p1", "Like");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Angry 18" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("button", { name: "Like 9" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("VotePanel", () => {
  const vote: VoteSummaryDto = {
    kind: "Fault",
    choices: ["FilmingDriver", "OtherRoadUser", "Both", "Nobody"],
    total: 3,
    results: null,
    myChoice: null,
    isClosed: false,
    closesAt: null,
    canVote: true,
  };

  it("hides the results until you vote, then shows them with your answer", async () => {
    actions.castVote.mockResolvedValueOnce({
      ok: true,
      data: {
        ...vote,
        total: 4,
        results: { FilmingDriver: 0, OtherRoadUser: 3, Both: 1, Nobody: 0 },
        myChoice: "OtherRoadUser",
      },
    });
    render(<VotePanel postId="p1" initial={vote} signedIn isMine={false} />);

    expect(screen.getByRole("heading", { name: "Who's at fault?" })).toBeVisible();
    expect(screen.queryByText("75%")).toBeNull();
    expect(screen.getByText(/Vote to see what others said/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "The other road user" }));
    expect(actions.castVote).toHaveBeenCalledWith("p1", "OtherRoadUser");
    expect(await screen.findByText("75%")).toBeVisible();
    expect(screen.getByText("25%")).toBeVisible();
    expect(screen.getByText(/Your vote/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Change my vote" })).toBeVisible();
  });
});

describe("SaveButton", () => {
  it("saves and puts it back if the server refuses", async () => {
    actions.savePost.mockResolvedValueOnce({ ok: false, error: "Nope" });
    render(<SaveButton postId="p1" saved={false} signedIn />);

    await userEvent.click(screen.getByRole("button", { name: "Save to bookmarks" }));
    expect(actions.savePost).toHaveBeenCalledWith("p1", true);
    expect(await screen.findByRole("button", { name: "Save to bookmarks" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("ReportDialog", () => {
  it("sends the chosen reason and details", async () => {
    const submit = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const onClose = vi.fn();
    render(<ReportDialog open onClose={onClose} what="post" submit={submit} />);

    await userEvent.click(screen.getByLabelText("Spam"));
    await userEvent.type(screen.getByLabelText(/Anything else/), "Same advert every day");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(submit).toHaveBeenCalledWith("Spam", "Same advert every day");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the server's message when the report is refused", async () => {
    const submit = vi.fn().mockResolvedValue({ ok: false, error: "You've already reported this post." });
    render(<ReportDialog open onClose={vi.fn()} what="post" submit={submit} />);

    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You've already reported this post.");
  });
});
