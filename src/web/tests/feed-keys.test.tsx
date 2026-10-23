import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PagedResult, PostDto } from "@/lib/types";
import { ANONYMOUS } from "@/lib/viewer";

// Only the keys are under test, so the browser-side parts of the feed are stand-ins.
vi.mock("@/components/FeedList", () => ({
  FeedList: ({ children }: { children: React.ReactNode }) => <div data-testid="list">{children}</div>,
}));
vi.mock("@/components/NewPosts", () => ({ NewPosts: () => <div data-testid="new-posts" /> }));
vi.mock("@/components/PostCard", () => ({
  PostCard: ({ post }: { post: PostDto }) => <article>{post.id}</article>,
}));
vi.mock("@/components/LinkExpiryRefresh", () => ({ LinkExpiryRefresh: () => null }));

import { Feed } from "@/components/Feed";

const post = (id: string) => ({ id, createdAt: "2026-10-23T10:00:00Z", media: [] }) as unknown as PostDto;

describe("the feed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("gives the new-posts watcher and the list different keys (they're siblings)", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const page = {
      items: [post("a"), post("b")],
      page: 1,
      pageSize: 20,
      totalCount: 2,
    } as PagedResult<PostDto>;

    const { getByTestId } = render(
      <Feed page={page} source={{ kind: "feed" }} viewer={ANONYMOUS} basePath="/" empty={null} />,
    );

    expect(getByTestId("new-posts")).toBeInTheDocument();
    expect(getByTestId("list")).toBeInTheDocument();
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
  });
});
