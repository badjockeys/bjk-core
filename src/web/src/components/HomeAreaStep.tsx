"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setHomeArea } from "@/actions/places";

import { PlaceSearch } from "./PlaceSearch";

/** Welcome step 1: choose a home area (a town or postcode), then go on to `next`. */
export function HomeAreaStep({ next }: { next: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="stack">
      <label className="label" htmlFor="welcome-area">
        Your town or postcode
      </label>
      <PlaceSearch
        id="welcome-area"
        value={text}
        placeholder="Start typing a town or postcode"
        onText={setText}
        onPick={(place) =>
          startTransition(async () => {
            setError(null);
            const result = await setHomeArea(place);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(next);
          })
        }
      />
      {pending ? (
        <p className="small muted" role="status">
          Saving…
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
