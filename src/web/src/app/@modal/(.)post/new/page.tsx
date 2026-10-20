import { PostComposer } from "@/components/PostComposer";

import { composerProps } from "@/app/post/new/composer-props";

/**
 * The composer as a pop-up over the page it was opened from (any link to /post/new inside the app), like Facebook
 * or X. Reloading or opening the link directly shows the /post/new page instead.
 */
export default async function NewPostModal() {
  return <PostComposer mode="modal" {...await composerProps()} />;
}
