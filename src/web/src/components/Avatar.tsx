import { initials } from "@/lib/format";

/** A round avatar: the person's photo, or their initials on the pale cyan tint. */
export function Avatar({
  name,
  url,
  size,
  decorative = true,
}: {
  name: string | null | undefined;
  url?: string | null;
  size?: "sm" | "lg";
  decorative?: boolean;
}) {
  const className = `avatar${size ? ` avatar-${size}` : ""}`;
  return (
    <span className={className} aria-hidden={decorative ? true : undefined}>
      {url ? <img src={url} alt={decorative ? "" : (name ?? "")} loading="lazy" /> : initials(name)}
    </span>
  );
}
