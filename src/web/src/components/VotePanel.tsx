"use client";

import { useState, useTransition } from "react";

import { castVote } from "@/actions/engagement";
import { followBlocker } from "@/lib/blockers";
import type { VoteChoice, VoteSummaryDto } from "@/lib/types";
import { VOTE_CHOICE_LABEL, VOTE_QUESTION, voteClosingText, voteCount, votePercentages } from "@/lib/votes";

import { toast } from "./toast";

/**
 * A post's vote: "Who's at fault?" or "How bad was it?". Answers are buttons until you vote; then (and for the author,
 * and once voting has closed) the results show as bars, with your answer marked. You can change your vote until it
 * closes. Signed-out visitors are sent to sign in; they see results once there are 10 votes.
 */
export function VotePanel({
  postId,
  initial,
  signedIn,
  isMine,
}: {
  postId: string;
  initial: VoteSummaryDto;
  signedIn: boolean;
  isMine: boolean;
}) {
  const [vote, setVote] = useState(initial);
  const [changing, setChanging] = useState(false);
  const [pending, startTransition] = useTransition();
  const question = VOTE_QUESTION[vote.kind];
  const closing = voteClosingText(vote);
  const showResults = vote.results !== null && !changing;

  const choose = (choice: VoteChoice) => {
    if (!signedIn) {
      followBlocker("signin");
      return;
    }
    startTransition(async () => {
      const result = await castVote(postId, choice);
      if (!result.ok) {
        if (!followBlocker(result.blocker)) {
          toast(result.error);
        }
        return;
      }
      setVote(result.data);
      setChanging(false);
    });
  };

  const percentages = votePercentages(vote.results ?? {}, vote.choices);

  return (
    <section className="vote" aria-labelledby={`vote-${postId}`}>
      <div className="spread">
        <h2 id={`vote-${postId}`} className="vote-q">
          {question}
        </h2>
        <span className="small muted">{voteCount(vote.total)}</span>
      </div>
      {showResults ? (
        <ul className="vote-results">
          {vote.choices.map((choice) => {
            const mine = vote.myChoice === choice;
            return (
              <li key={choice} className={`vote-result${mine ? " vote-mine" : ""}`}>
                <span className="vote-bar" style={{ width: `${percentages[choice]}%` }} aria-hidden="true" />
                <span className="vote-label">
                  {VOTE_CHOICE_LABEL[choice]}
                  {mine ? <span className="vote-you"> · Your vote</span> : null}
                </span>
                <span className="vote-pct">{percentages[choice]}%</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="vote-choices" role="group" aria-label={question}>
          {vote.choices.map((choice) => (
            <button
              key={choice}
              type="button"
              className={`react${vote.myChoice === choice ? " react-on" : ""}`}
              aria-pressed={vote.myChoice === choice}
              disabled={pending || (signedIn && !vote.canVote)}
              onClick={() => choose(choice)}
            >
              {VOTE_CHOICE_LABEL[choice]}
            </button>
          ))}
        </div>
      )}
      <p className="small muted vote-foot">
        {!showResults && !isMine && vote.total > 0 ? "Vote to see what others said. " : null}
        {isMine ? "You can't vote on your own post. " : null}
        {closing ? `${closing}.` : null}
        {showResults && vote.canVote && vote.myChoice ? (
          <>
            {" "}
            <button type="button" className="link-btn" onClick={() => setChanging(true)}>
              Change my vote
            </button>
          </>
        ) : null}
      </p>
    </section>
  );
}
