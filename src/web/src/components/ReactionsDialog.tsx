"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { listReactions } from "@/actions/posts";
import { profilePath } from "@/lib/paths";
import { REACTIONS, reactionOf, reactionTotal } from "@/lib/reactions";
import type { PostReactionsDto, ReactionCounts, ReactionType, ReactorDto } from "@/lib/types";

import { Avatar } from "./Avatar";
import { Modal } from "./Modal";

const PAGE_SIZE = 30;

/**
 * Who reacted to a post (owner, 22 Oct 2026): a tab per reaction with its count, and a search by name. Under-18s are
 * counted but not named, so the list can be shorter than the total ("and N others").
 */
export function ReactionsDialog({
  postId,
  counts: initialCounts,
  onClose,
}: {
  postId: string;
  counts: ReactionCounts;
  onClose: () => void;
}) {
  const titleId = useId();
  const [type, setType] = useState<ReactionType | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<ReactorDto[]>([]);
  const [data, setData] = useState<PostReactionsDto | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void listReactions(postId, { type, search: query, page: 1, pageSize: PAGE_SIZE }).then((result) => {
      if (!current) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData(result.data);
      setPeople(result.data.people.items);
      setPage(1);
    });
    return () => {
      current = false;
    };
  }, [postId, type, query]);

  const more = async () => {
    setLoading(true);
    const result = await listReactions(postId, { type, search: query, page: page + 1, pageSize: PAGE_SIZE });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPeople((list) => [...list, ...result.data.people.items]);
    setPage(page + 1);
  };

  const counts = data?.counts ?? initialCounts;
  const total = data?.total ?? reactionTotal(initialCounts);
  const hasMore = data ? people.length < data.people.totalCount : false;

  return (
    <Modal open onClose={onClose} title="Reactions" titleId={titleId}>
      <div className="rx-tabs" role="tablist" aria-label="Filter by reaction">
        <button
          type="button"
          role="tab"
          aria-selected={type === null}
          className={`rx-tab${type === null ? " rx-tab-on" : ""}`}
          onClick={() => setType(null)}
        >
          All {total}
        </button>
        {REACTIONS.filter((r) => (counts[r.type] ?? 0) > 0).map((r) => (
          <button
            key={r.type}
            type="button"
            role="tab"
            aria-selected={type === r.type}
            aria-label={`${r.label} ${counts[r.type] ?? 0}`}
            className={`rx-tab${type === r.type ? " rx-tab-on" : ""}`}
            onClick={() => setType(r.type)}
          >
            <span aria-hidden="true">{r.emoji}</span> {counts[r.type]}
          </button>
        ))}
      </div>

      <label className="sr-only" htmlFor={`${titleId}-search`}>
        Search by name
      </label>
      <input
        id={`${titleId}-search`}
        type="search"
        className="input"
        placeholder="Search by name"
        value={search}
        maxLength={50}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error ? <p className="error">{error}</p> : null}

      <ul className="rx-list" aria-busy={loading} aria-label="People who reacted">
        {people.map((p) => (
          <li key={p.userId} className="rx-person">
            <span className="rx-avatar">
              <Avatar name={p.displayName} url={p.avatarUrl} size="sm" />
              <span className="rx-badge" aria-hidden="true">
                {reactionOf(p.type).emoji}
              </span>
            </span>
            <Link href={profilePath(p.handle)} className="rx-name" onClick={onClose}>
              <strong>{p.displayName}</strong>
              <span className="muted small">@{p.handle}</span>
            </Link>
            <span className="sr-only">{reactionOf(p.type).label}</span>
          </li>
        ))}
      </ul>

      {!loading && people.length === 0 && !error ? (
        <p className="muted small">{query ? "No one by that name." : "No one to show yet."}</p>
      ) : null}
      {data && data.unnamedCount > 0 ? (
        <p className="muted small">
          {people.length > 0 ? "And " : ""}
          {data.unnamedCount} {data.unnamedCount === 1 ? "other" : "others"}
          {people.length > 0 ? "." : " reacted."}
        </p>
      ) : null}
      {hasMore ? (
        <button type="button" className="btn btn-block" onClick={more} disabled={loading}>
          Show more
        </button>
      ) : null}
    </Modal>
  );
}
