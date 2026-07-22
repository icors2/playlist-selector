"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatApproval, myVote } from "@/lib/consensus";
import { authHeaders } from "@/lib/session";
import type { CatalogTrack } from "@/lib/catalog-data";
import type { RoomStateResponse } from "@/lib/types";
import type { VoteValue } from "@/lib/models";

function formatDuration(ms: number) {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function phaseLabel(phase: string) {
  switch (phase) {
    case "lobby":
      return "Lobby";
    case "nominate":
      return "Nominate";
    case "vote":
      return "Vote";
    case "results":
      return "Results";
    default:
      return phase;
  }
}

export function RoomClient({ code }: { code: string }) {
  const roomCode = code.toUpperCase();
  const [state, setState] = useState<RoomStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [listCopied, setListCopied] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogTrack[]>([]);
  const [catalogSource, setCatalogSource] = useState<
    "itunes" | "database" | "seed" | null
  >(null);
  const [searching, setSearching] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/rooms/${roomCode}`, {
      headers: authHeaders(roomCode),
      cache: "no-store",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Room not found");
    }
    const data = (await res.json()) as RoomStateResponse;
    setState(data);
    setLoading(false);
    setError(null);
  }, [roomCode]);

  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        await refresh();
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : "Failed to load room");
          setLoading(false);
        }
      }
    }
    boot();
    const id = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 2500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  useEffect(() => {
    if (!state || state.room.phase !== "nominate") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/catalog/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        setCatalog(data.tracks ?? []);
        setCatalogSource(data.source ?? null);
      } catch {
        /* ignore abort */
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, state?.room.phase]);

  const votedCount = useMemo(() => {
    if (!state?.viewer) return 0;
    return state.songs.filter((s) =>
      s.votes.some((v) => v.participantId === state.viewer!.id),
    ).length;
  }, [state]);

  const requiredApprovals =
    state?.consensus.requiredApprovals ??
    Math.ceil(Math.max(1, state?.participants.length ?? 1) * 0.8);

  async function setPhase(phase: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: authHeaders(roomCode),
        body: JSON.stringify({ phase }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update phase");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function nominateManual(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/songs`, {
        method: "POST",
        headers: authHeaders(roomCode),
        body: JSON.stringify({
          name: songTitle.trim(),
          artists: songArtist.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add song");
      setSongTitle("");
      setSongArtist("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add song");
    } finally {
      setBusy(false);
    }
  }

  async function nominateFromCatalog(track: CatalogTrack) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/songs`, {
        method: "POST",
        headers: authHeaders(roomCode),
        body: JSON.stringify({
          id: track.externalId || `catalog:${track.id}`,
          name: track.title,
          artists: track.artists,
          albumArt: track.albumArt,
          durationMs: track.durationMs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add song");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add song");
    } finally {
      setBusy(false);
    }
  }

  async function removeSong(songId: string) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/rooms/${roomCode}/songs?songId=${encodeURIComponent(songId)}`,
        {
          method: "DELETE",
          headers: authHeaders(roomCode),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove song");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  async function vote(songId: string, value: VoteValue) {
    try {
      const res = await fetch(`/api/rooms/${roomCode}/votes`, {
        method: "POST",
        headers: authHeaders(roomCode),
        body: JSON.stringify({ songId, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Vote failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    }
  }

  async function joinRoom(e: FormEvent) {
    e.preventDefault();
    setJoinError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          code: roomCode,
          name: joinName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not join");
      const { storeParticipantToken } = await import("@/lib/session");
      storeParticipantToken(data.code, data.participantToken);
      await refresh();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Could not join");
    }
  }

  async function copyInvite() {
    const url = `${window.location.origin}/room/${roomCode}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function copyWinningList() {
    if (!state) return;
    const lines = state.consensus.playlist.map(
      (s, i) => `${i + 1}. ${s.name} — ${s.artists}`,
    );
    const text =
      lines.length > 0
        ? `Okaylist — ${state.room.name}\n\n${lines.join("\n")}\n\nAdd these to Spotify manually.`
        : "No songs reached 80% approval.";
    await navigator.clipboard.writeText(text);
    setListCopied(true);
    window.setTimeout(() => setListCopied(false), 1600);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-paper-dim">
        Loading room…
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="font-display text-3xl font-bold">Room not found</p>
        <p className="text-paper-dim">{error}</p>
        <Link href="/" className="btn-primary">
          Back home
        </Link>
      </div>
    );
  }

  if (!state) return null;

  if (!state.viewer) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5">
        <Link href="/" className="mb-8 font-display text-2xl font-extrabold">
          Okaylist
        </Link>
        <div className="panel p-6">
          <p className="text-sm uppercase tracking-[0.18em] text-amber">
            Room {roomCode}
          </p>
          <h1 className="font-display mt-2 text-3xl font-extrabold">
            {state.room.name}
          </h1>
          <p className="mt-2 text-paper-dim">
            Pick a name to join this group playlist.
          </p>
          <form className="mt-5 grid gap-3" onSubmit={joinRoom}>
            <input
              className="field"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="Your name"
              required
              maxLength={40}
            />
            <button className="btn-primary" type="submit">
              Join room
            </button>
          </form>
          {joinError ? (
            <p className="mt-3 text-sm text-[#f0a090]">{joinError}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-5 pb-20 pt-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <Link href="/" className="font-display text-xl font-extrabold text-amber">
            Okaylist
          </Link>
          <h1 className="font-display mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {state.room.name}
          </h1>
          <p className="mt-1 text-paper-dim">
            Room <span className="tracking-[0.2em] text-paper">{roomCode}</span>
            {" · "}
            {phaseLabel(state.room.phase)}
            {" · "}
            You are {state.viewer.name}
            {state.isHost ? " (host)" : ""}
            {" · "}
            Need {requiredApprovals}/{state.participants.length} approvals
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={copyInvite}>
            {copied ? "Copied" : "Copy invite"}
          </button>
          {state.isHost && state.room.phase === "lobby" ? (
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => setPhase("nominate")}
            >
              Start nominations
            </button>
          ) : null}
          {state.isHost && state.room.phase === "nominate" ? (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || state.songs.length === 0}
              onClick={() => setPhase("vote")}
            >
              Start voting
            </button>
          ) : null}
          {state.isHost && state.room.phase === "vote" ? (
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => setPhase("results")}
            >
              Reveal playlist
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="mt-4 text-sm text-[#f0a090]" role="alert">
          {error}
        </p>
      ) : null}

      {state.room.storage === "memory" ? (
        <p className="mt-4 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          Temporary memory storage — deploy to Netlify for a shared database.
        </p>
      ) : null}

      <section className="mt-8 animate-rise-delay">
        <div className="flex flex-wrap items-center gap-2">
          {state.participants.map((p) => (
            <span
              key={p.id}
              className="rounded-full border border-[var(--line)] px-3 py-1 text-sm text-paper-dim"
            >
              {p.name}
              {p.id === state.viewer?.id ? " · you" : ""}
            </span>
          ))}
        </div>
      </section>

      {state.room.phase === "lobby" ? (
        <section className="panel mt-10 p-6 sm:p-8 animate-rise-delay-2">
          <h2 className="font-display text-2xl font-bold">Waiting room</h2>
          <p className="mt-2 max-w-xl text-paper-dim">
            Share the code. Search the song database to nominate tracks people
            recognize, then vote. A song makes the playlist when at least{" "}
            <span className="text-paper">80% of the group</span> marks it Love
            or Okay — then copy the winners into Spotify by hand.
          </p>
          <p className="mt-6 font-display text-5xl tracking-[0.25em] text-amber">
            {roomCode}
          </p>
          {state.isHost ? (
            <button
              type="button"
              className="btn-primary mt-8"
              disabled={busy}
              onClick={() => setPhase("nominate")}
            >
              Start nominations
            </button>
          ) : (
            <p className="mt-4 text-sm text-paper-dim">
              Waiting for the host to start nominations…
            </p>
          )}
        </section>
      ) : null}

      {state.room.phase === "nominate" ? (
        <section className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="panel p-5 sm:p-6">
            <h2 className="font-display text-2xl font-bold">Nominate songs</h2>
            <p className="mt-1 text-sm text-paper-dim">
              Search Apple’s iTunes catalog (free, no login) — artwork, album,
              year, and genre so everyone knows what they’re voting for.
            </p>

            <input
              className="field mt-4"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs or artists…"
            />
            {catalogSource ? (
              <p className="mt-2 text-xs text-paper-dim">
                {catalogSource === "itunes"
                  ? "Results from iTunes Search"
                  : catalogSource === "database"
                    ? "Results from local catalog"
                    : "Built-in catalog"}
                {searching ? " · searching…" : ""}
              </p>
            ) : null}

            <ul className="mt-4 grid gap-2">
              {catalog.length === 0 && !searching ? (
                <li className="text-sm text-paper-dim">
                  No matches. Try another search or add a song manually below.
                </li>
              ) : null}
              {catalog.map((track) => {
                const already = state.songs.some(
                  (s) =>
                    s.spotifyTrackId === (track.externalId || `catalog:${track.id}`) ||
                    (s.name.toLowerCase() === track.title.toLowerCase() &&
                      s.artists.toLowerCase() === track.artists.toLowerCase()),
                );
                return (
                  <li
                    key={track.id}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--line)] p-2.5"
                  >
                    {track.albumArt ? (
                      <Image
                        src={track.albumArt}
                        alt=""
                        width={52}
                        height={52}
                        className="h-[52px] w-[52px] shrink-0 rounded-lg object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg bg-ink-soft text-xs text-paper-dim">
                        ♪
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{track.title}</p>
                      <p className="truncate text-sm text-paper-dim">
                        {track.artists}
                      </p>
                      <p className="truncate text-xs text-paper-dim/80">
                        {[track.album, track.year, track.genre, formatDuration(track.durationMs)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost shrink-0 px-3 py-2 text-sm"
                      disabled={already || busy}
                      onClick={() => nominateFromCatalog(track)}
                    >
                      {already ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 border-t border-[var(--line)] pt-4">
              <button
                type="button"
                className="text-sm text-amber underline"
                onClick={() => setShowManual((v) => !v)}
              >
                {showManual
                  ? "Hide manual entry"
                  : "Song not in the database? Add it manually"}
              </button>
              {showManual ? (
                <form className="mt-3 grid gap-3" onSubmit={nominateManual}>
                  <label className="grid gap-1.5 text-sm text-paper-dim">
                    Song title
                    <input
                      className="field"
                      value={songTitle}
                      onChange={(e) => setSongTitle(e.target.value)}
                      placeholder="Mr. Brightside"
                      required
                      maxLength={200}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm text-paper-dim">
                    Artist
                    <input
                      className="field"
                      value={songArtist}
                      onChange={(e) => setSongArtist(e.target.value)}
                      placeholder="The Killers"
                      required
                      maxLength={200}
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn-primary justify-self-start"
                    disabled={busy || !songTitle.trim() || !songArtist.trim()}
                  >
                    {busy ? "Adding…" : "Add custom song"}
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          <div className="panel p-5 sm:p-6">
            <h2 className="font-display text-2xl font-bold">
              Nominated ({state.songs.length})
            </h2>
            <ul className="mt-4 grid gap-3">
              {state.songs.length === 0 ? (
                <li className="text-sm text-paper-dim">No songs yet.</li>
              ) : null}
              {state.songs.map((song) => (
                <li key={song.id} className="flex items-center gap-3">
                  {song.albumArt ? (
                    <Image
                      src={song.albumArt}
                      alt=""
                      width={44}
                      height={44}
                      className="h-11 w-11 shrink-0 rounded-lg object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="h-11 w-11 shrink-0 rounded-lg bg-ink-soft" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{song.name}</p>
                    <p className="truncate text-sm text-paper-dim">
                      {song.artists}
                      {song.nominatedByName
                        ? ` · ${song.nominatedByName}`
                        : ""}
                    </p>
                  </div>
                  {(state.isHost ||
                    song.nominatedBy === state.viewer?.id) && (
                    <button
                      type="button"
                      className="text-sm text-paper-dim hover:text-pass"
                      onClick={() => removeSong(song.id)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {state.room.phase === "vote" ? (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">Cast your votes</h2>
              <p className="mt-1 text-paper-dim">
                Love or Okay counts as approval. A song needs{" "}
                <span className="text-paper">
                  {requiredApprovals} of {state.participants.length}
                </span>{" "}
                approvals (80%) to make the playlist.
              </p>
            </div>
            <p className="text-sm text-paper-dim">
              {votedCount}/{state.songs.length} voted
            </p>
          </div>
          <ul className="grid gap-4">
            {state.songs.map((song) => {
              const current = myVote(song, state.viewer!.id);
              const summary = state.consensus.all.find((s) => s.id === song.id);
              return (
                <li
                  key={song.id}
                  className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {song.albumArt ? (
                      <Image
                        src={song.albumArt}
                        alt=""
                        width={56}
                        height={56}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-ink-soft text-paper-dim">
                        ♪
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{song.name}</p>
                      <p className="truncate text-sm text-paper-dim">
                        {song.artists}
                        {summary ? ` · ${formatApproval(summary)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto sm:min-w-[280px]">
                    {(
                      [
                        ["love", "Love"],
                        ["okay", "Okay"],
                        ["pass", "Pass"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className="vote-btn"
                        data-kind={value}
                        data-active={current === value}
                        onClick={() => vote(song.id, value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {state.room.phase === "results" ? (
        <section className="mt-10 grid gap-8">
          <div className="panel p-6 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-3xl font-extrabold">
                  Your okaylist
                </h2>
                <p className="mt-2 max-w-xl text-paper-dim">
                  {state.consensus.playlist.length} songs hit 80% approval
                  ({requiredApprovals}+ of {state.participants.length}). Copy
                  the list and add them to Spotify yourself.
                </p>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={copyWinningList}
                disabled={state.consensus.playlist.length === 0}
              >
                {listCopied ? "Copied" : "Copy playlist text"}
              </button>
            </div>

            <ol className="mt-8 grid gap-3">
              {state.consensus.playlist.length === 0 ? (
                <li className="text-paper-dim">
                  Nothing reached 80% yet. Go back to voting or nominate
                  different songs.
                </li>
              ) : null}
              {state.consensus.playlist.map((song, index) => (
                <li
                  key={song.id}
                  className="flex items-center gap-3 border-b border-[var(--line)] pb-3 last:border-none"
                >
                  <span className="w-6 text-sm text-paper-dim">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{song.name}</p>
                    <p className="truncate text-sm text-paper-dim">
                      {song.artists}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm text-foam">
                    {formatApproval(song)}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {state.consensus.vetoed.length > 0 ? (
            <div className="panel p-6">
              <h3 className="font-display text-xl font-bold">
                Didn’t reach 80%
              </h3>
              <ul className="mt-4 grid gap-2">
                {state.consensus.vetoed.map((song) => (
                  <li
                    key={song.id}
                    className="flex items-center justify-between gap-3 text-sm text-paper-dim"
                  >
                    <span className="truncate">
                      {song.name} — {song.artists}
                    </span>
                    <span className="shrink-0">{formatApproval(song)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
