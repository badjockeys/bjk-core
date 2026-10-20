import { FeedPage } from "@/components/FeedPage";
import { getViewer } from "@/lib/auth";
import { pageNumber } from "@/lib/feed";

const SIGN_IN_PROBLEMS: Record<string, string> = {
  failed: "Signing in didn't work. Please try again.",
  expired: "That sign-in took too long. Please try again.",
};

/** Screens 01 and 02: home, on the For you timeline. */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();
  const signin = typeof params.signin === "string" ? params.signin : "";
  return (
    <FeedPage
      viewer={viewer}
      home={{ kind: "for-you" }}
      label={null}
      basePath="/"
      page={pageNumber(params.page)}
      notice={SIGN_IN_PROBLEMS[signin] ?? null}
    />
  );
}
