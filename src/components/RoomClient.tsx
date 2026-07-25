"use client";

import Image from "next/image";
import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchJson } from "@/lib/api";
import { formatApproval, myVote } from "@/lib/consensus";
import { authHeaders, getStoredTokens } from "@/lib/session";
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
    case "ready":
      return "Ready check";
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
  const [joinPassword, setJoinPassword] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogTrack[]>([]);
  const [catalogSource, setCatalogSource] = useState<
    "spotify" | "itunes" | "database" | "seed" | null
  >(null);
  const [searching, setSearching] = useState(false);
  const [newSongIds, setNewSongIds] = useState<Set<string>>(new Set());
  const [playlistUrl, setPlaylistUrl] = useState(
    "https://open.spotify.com/playlist/5GZfxd5LeJg0rH2tVcXRcB?si=PkkG9DGdSUKedxzP0WFGfQ",
  );
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [spotifyReady, setSpotifyReady] = useState<boolean | null>(null);
  const seenSongIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    const { res, data } = await fetchJson<RoomStateResponse & { error?: string }>(
      `/api/rooms/${roomCode}`,
      {
        headers: authHeaders(roomCode),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      throw new Error(data.error || "Room not found");
    }

    const incomingIds = data.songs.map((s) => s.id);
    if (!hasLoadedRef.current) {
      seenSongIdsRef.current = new Set(incomingIds);
      hasLoadedRef.current = true;
    } else {
      const arrived = incomingIds.filter(
        (id) => !seenSongIdsRef.current.has(id),
      );
      if (arrived.length > 0) {
        for (const id of arrived) seenSongIdsRef.current.add(id);
        setNewSongIds((current) => {
          const next = new Set(current);
          for (const id of arrived) next.add(id);
          return next;
        });
        window.setTimeout(() => {
          setNewSongIds((current) => {
            const next = new Set(current);
            for (const id of arrived) next.delete(id);
            return next;
          });
        }, 8000);
      }
    }

    setState(data);
    setLoading(false);
    setError(null);
  }, [roomCode]);

  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        const params = new URLSearchParams(window.location.search);
        const spotifyStatus = params.get("spotify");
        if (spotifyStatus === "success" || spotifyStatus?.startsWith("success_")) {
          const n = spotifyStatus.startsWith("success_")
            ? spotifyStatus.slice("success_".length)
            : "";
          setImportMessage(
            n
              ? `Spotify playlist updated with ${n} song${n === "1" ? "" : "s"}. Open the linked playlist to verify.`
              : "Spotify playlist updated with the winning songs. Open it to verify.",
          );
        } else if (
          spotifyStatus === "created" ||
          spotifyStatus?.startsWith("created_")
        ) {
          const n = spotifyStatus.startsWith("created_")
            ? spotifyStatus.slice("created_".length)
            : "";
          setImportMessage(
            n
              ? `Created a new Spotify playlist with ${n} song${n === "1" ? "" : "s"} (no playlist was linked). Open it from the button above.`
              : "Created a new Spotify playlist with the winners.",
          );
        } else if (spotifyStatus === "denied") {
          setError("Spotify authorization was denied.");
        } else if (spotifyStatus === "no_spotify_tracks") {
          setError(
            "No Spotify track IDs to export — nominate via Spotify search (not iTunes/manual) so winners can be written back.",
          );
        } else if (spotifyStatus === "token") {
          setError(
            "Spotify login failed (token exchange). Confirm NEXT_PUBLIC_APP_URL and the Spotify Dashboard redirect URI are exactly https://okaylist.onrender.com/api/spotify/export",
          );
        } else if (spotifyStatus === "playlist") {
          setError(
            "Couldn’t write to your linked Spotify playlist. Agree while logged into the Spotify account that owns it, and make sure the playlist was linked before export.",
          );
        } else if (spotifyStatus === "no_link") {
          setError(
            "No Spotify playlist linked. Paste your playlist URL and tap Link playlist, then submit again.",
          );
        } else if (spotifyStatus === "empty_write") {
          setError(
            "Spotify login worked but the playlist still has 0 tracks. Check playlist ownership and try again.",
          );
        } else if (spotifyStatus === "room") {
          setError("Couldn’t verify host session after Spotify login. Try exporting again from this device.");
        } else if (spotifyStatus === "error") {
          setError("Could not update Spotify playlist. Try again.");
        }
        if (spotifyStatus) {
          window.history.replaceState({}, "", `/room/${roomCode}`);
        }

        await refresh();
        const { data: status } = await fetchJson<{
          configured?: boolean;
          tokenOk?: boolean;
          searchOk?: boolean;
          error?: string;
        }>("/api/spotify/status");
        if (alive) {
          // Ready for OAuth export when credentials exist; search may still be down.
          setSpotifyReady(Boolean(status.configured));
          if (status.configured && status.searchOk === false) {
            setError(
              status.error ||
                "Spotify search isn’t working (Client Credentials). Nominations may use iTunes until Render env secrets are fixed — export will try to match titles.",
            );
          }
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : "Failed to load room");
          setLoading(false);
        }
      }
    }
    boot();

    // Live poll so newly added songs show up for everyone without a manual refresh.
    const id = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 1500);

    function onVisible() {
      if (document.visibilityState === "visible") {
        refresh().catch(() => undefined);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh, roomCode]);

  const canAddSongs =
    state?.room.phase === "nominate" || state?.room.phase === "vote";

  useEffect(() => {
    if (!canAddSongs) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await fetchJson<{
          tracks?: CatalogTrack[];
          source?: "spotify" | "itunes" | "database" | "seed" | null;
        }>(`/api/catalog/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        setCatalog(data.tracks ?? []);
        setCatalogSource(data.source ?? null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        /* ignore transient search failures */
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, canAddSongs]);

  const votedCount = useMemo(() => {
    if (!state?.viewer) return 0;
    return state.songs.filter((s) =>
      s.votes.some((v) => v.participantId === state.viewer!.id),
    ).length;
  }, [state]);

  const voteSongs = useMemo(() => {
    if (!state?.viewer) return state?.songs ?? [];
    const viewerId = state.viewer.id;
    return [...state.songs].sort((a, b) => {
      const aVoted = a.votes.some((v) => v.participantId === viewerId);
      const bVoted = b.votes.some((v) => v.participantId === viewerId);
      if (aVoted !== bVoted) return aVoted ? 1 : -1;
      const aNew = newSongIds.has(a.id);
      const bNew = newSongIds.has(b.id);
      if (aNew !== bNew) return aNew ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [state, newSongIds]);

  const requiredApprovals =
    state?.consensus.requiredApprovals ??
    Math.ceil(Math.max(1, state?.participants.length ?? 1) * 0.8);

  async function setPhase(phase: string) {
    setBusy(true);
    try {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/rooms/${roomCode}`,
        {
          method: "PATCH",
          headers: authHeaders(roomCode),
          body: JSON.stringify({ phase }),
        },
      );
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
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/rooms/${roomCode}/songs`,
        {
          method: "POST",
          headers: authHeaders(roomCode),
          body: JSON.stringify({
            name: songTitle.trim(),
            artists: songArtist.trim(),
          }),
        },
      );
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
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/rooms/${roomCode}/songs`,
        {
          method: "POST",
          headers: authHeaders(roomCode),
          body: JSON.stringify({
            id: track.externalId || `catalog:${track.id}`,
            name: track.title,
            artists: track.artists,
            albumArt: track.albumArt,
            durationMs: track.durationMs,
          }),
        },
      );
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
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/rooms/${roomCode}/songs?songId=${encodeURIComponent(songId)}`,
        {
          method: "DELETE",
          headers: authHeaders(roomCode),
        },
      );
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
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/rooms/${roomCode}/votes`,
        {
          method: "POST",
          headers: authHeaders(roomCode),
          body: JSON.stringify({ songId, value }),
        },
      );
      if (!res.ok) throw new Error(data.error || "Vote failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    }
  }

  async function answerReady(ready: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { res, data } = await fetchJson<{
        error?: string;
        advanced?: boolean;
      }>(`/api/rooms/${roomCode}/ready`, {
        method: "POST",
        headers: authHeaders(roomCode),
        body: JSON.stringify({ ready }),
      });
      if (!res.ok) throw new Error(data.error || "Could not save ready answer");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save ready answer");
    } finally {
      setBusy(false);
    }
  }

  async function markVotingDone() {
    setBusy(true);
    setError(null);
    try {
      const { res, data } = await fetchJson<{
        error?: string;
        advanced?: boolean;
      }>(`/api/rooms/${roomCode}/done`, {
        method: "POST",
        headers: authHeaders(roomCode),
      });
      if (!res.ok) throw new Error(data.error || "Could not finish voting");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish voting");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(e: FormEvent) {
    e.preventDefault();
    setJoinError(null);
    try {
      const { res, data } = await fetchJson<{
        code?: string;
        participantToken?: string;
        error?: string;
      }>("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          code: roomCode,
          name: joinName,
          password: joinPassword,
        }),
      });
      if (!res.ok || !data.code || !data.participantToken) {
        throw new Error(data.error || "Could not join");
      }
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

  async function exportPlaylist() {
    setBusy(true);
    setError(null);
    setImportMessage("Connecting to Spotify — you should see the Agree screen next…");

    const { hostToken } = getStoredTokens(roomCode);
    if (!hostToken) {
      setImportMessage(null);
      setError(
        "Host session missing on this device. Open the room from the browser where you created it, then try again.",
      );
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);

    try {
      const { res, data } = await fetchJson<{
        next?: string;
        url?: string;
        error?: string;
      }>(
        "/api/spotify/export",
        {
          method: "POST",
          headers: authHeaders(roomCode),
          body: JSON.stringify({ code: roomCode }),
          signal: controller.signal,
        },
        { retries: 2, retryDelayMs: 800 },
      );
      if (!res.ok) {
        throw new Error(data.error || "Export failed");
      }

      // Prefer same-origin hop (sets cookies, then 302 → Spotify).
      const target = data.next || data.url;
      if (!target) {
        throw new Error("Export failed — no Spotify URL returned");
      }

      setImportMessage("Redirecting to Spotify…");
      window.location.assign(target);
    } catch (err) {
      setImportMessage(null);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Timed out connecting to Spotify. Wait a moment and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Export failed");
      }
      setBusy(false);
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function importPlaylist(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setImportMessage(null);
    setError(null);
    try {
      const { res, data } = await fetchJson<{
        added?: number;
        skipped?: number;
        playlistName?: string;
        linkedOnly?: boolean;
        error?: string;
      }>("/api/spotify/import", {
        method: "POST",
        headers: authHeaders(roomCode),
        body: JSON.stringify({
          code: roomCode,
          playlistUrl: playlistUrl.trim(),
        }),
      });
      if (!res.ok) throw new Error(data.error || "Import failed");
      if (data.linkedOnly || data.added === 0) {
        setImportMessage(
          `Linked “${data.playlistName ?? "playlist"}” — winners will write to this Spotify playlist.`,
        );
      } else {
        setImportMessage(
          `Imported ${data.added} songs` +
            (data.skipped ? ` (${data.skipped} already on the list)` : "") +
            ` from “${data.playlistName}”.`,
        );
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
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
            <input
              className="field"
              type="password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              placeholder="Room password"
              required
              autoComplete="current-password"
              maxLength={200}
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
              onClick={() => setPhase("ready")}
            >
              Ask if everyone’s ready
            </button>
          ) : null}
          {state.isHost && state.room.phase === "ready" ? (
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => setPhase("nominate")}
            >
              Back to add songs
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="mt-4 text-sm text-[#f0a090]" role="alert">
          {error}
        </p>
      ) : null}

      {importMessage ? (
        <p
          className="mt-4 rounded-xl border border-foam/40 bg-foam/10 px-3 py-2 text-sm text-foam"
          role="status"
        >
          {importMessage}
        </p>
      ) : null}

      {state.room.storage === "memory" ? (
        <p className="mt-4 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          Temporary memory storage — set DATABASE_URL (Render Postgres) for a shared database.
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
              {state.room.phase === "ready"
                ? p.isReady
                  ? " · ready"
                  : " · waiting"
                : ""}
              {state.room.phase === "vote"
                ? p.votingDone
                  ? " · done"
                  : " · voting"
                : ""}
            </span>
          ))}
        </div>
      </section>

      {state.room.phase === "lobby" ? (
        <section className="panel mt-10 p-6 sm:p-8 animate-rise-delay-2">
          <h2 className="font-display text-2xl font-bold">Waiting room</h2>
          <p className="mt-2 max-w-xl text-paper-dim">
            Copy the invite so everyone opens the room on their own phone —
            anyone who joins can add songs. Link a Spotify playlist you own;
            after voting the host can write winners to it. Songs need{" "}
            <span className="text-paper">80% Love/Okay</span> approvals.
          </p>
          <p className="mt-6 font-display text-5xl tracking-[0.25em] text-amber">
            {roomCode}
          </p>

          {state.isHost ? (
            <form className="mt-8 grid gap-3" onSubmit={importPlaylist}>
              <label className="grid gap-1.5 text-sm text-paper-dim">
                Your Spotify playlist (owned by you)
                <input
                  className="field text-sm"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/…"
                  inputMode="url"
                />
              </label>
              {spotifyReady === false ? (
                <p className="text-xs text-amber">
                  Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on Render, plus
                  redirect URI{" "}
                  <code className="text-[11px]">
                    /api/spotify/export
                  </code>
                  .
                </p>
              ) : spotifyReady ? (
                <p className="text-xs text-foam">Spotify API connected.</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy || !playlistUrl.trim() || spotifyReady === false}
                >
                  {busy ? "Linking…" : "Link playlist & start"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => setPhase("nominate")}
                >
                  Skip — nominate without linking
                </button>
              </div>
              {importMessage ? (
                <p className="text-sm text-foam">{importMessage}</p>
              ) : null}
            </form>
          ) : (
            <p className="mt-4 text-sm text-paper-dim">
              Waiting for the host to link a playlist or start nominations…
            </p>
          )}
        </section>
      ) : null}

      {state.room.phase === "nominate" ? (
        <section className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="panel p-5 sm:p-6">
            <h2 className="font-display text-2xl font-bold">Nominate songs</h2>
            <p className="mt-1 text-sm text-paper-dim">
              Everyone who joined can add songs from their own phone — share the
              invite. Search Spotify first (iTunes backup if needed) so winners
              can be written to your playlist.
            </p>

            {state.isHost ? (
              <form
                className="mt-4 grid gap-2 border-b border-[var(--line)] pb-4"
                onSubmit={importPlaylist}
              >
                <label className="grid gap-1.5 text-sm text-paper-dim">
                  Link / import Spotify playlist
                  <input
                    className="field text-sm"
                    value={playlistUrl}
                    onChange={(e) => setPlaylistUrl(e.target.value)}
                    placeholder="https://open.spotify.com/playlist/…"
                    inputMode="url"
                  />
                </label>
                <button
                  type="submit"
                  className="btn-ghost justify-self-start px-4 py-2 text-sm"
                  disabled={busy || !playlistUrl.trim() || spotifyReady === false}
                >
                  {busy ? "Working…" : "Link / import playlist"}
                </button>
                {importMessage ? (
                  <p className="text-sm text-foam">{importMessage}</p>
                ) : null}
                {state.room.spotifyPlaylistUrl ? (
                  <p className="text-xs text-paper-dim">
                    Linked:{" "}
                    <a
                      className="text-amber underline"
                      href={state.room.spotifyPlaylistUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      open in Spotify
                    </a>
                    . Export will update this list.
                  </p>
                ) : null}
              </form>
            ) : null}

            <input
              className="field mt-4"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Spotify…"
            />
            {catalogSource ? (
              <p className="mt-2 text-xs text-paper-dim">
                {catalogSource === "spotify"
                  ? "Results from Spotify"
                  : catalogSource === "itunes"
                    ? "Results from iTunes (Spotify unavailable)"
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

      {state.room.phase === "ready" ? (
        <section className="panel mt-10 p-6 sm:p-8 animate-rise-delay-2">
          <h2 className="font-display text-2xl font-bold">
            Ready to vote?
          </h2>
          <p className="mt-2 max-w-xl text-paper-dim">
            Everyone in the room needs to answer. Choose <span className="text-paper">Yes</span>{" "}
            only if you’re done adding songs. When everyone says yes, voting
            starts automatically.
          </p>
          <p className="mt-4 text-sm text-paper-dim">
            {state.participants.filter((p) => p.isReady).length}/
            {state.participants.length} ready
          </p>
          <ul className="mt-4 grid gap-2">
            {state.participants.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2 text-sm last:border-none"
              >
                <span>
                  {p.name}
                  {p.id === state.viewer?.id ? " (you)" : ""}
                </span>
                <span className={p.isReady ? "text-foam" : "text-paper-dim"}>
                  {p.isReady ? "Yes" : "Not yet"}
                </span>
              </li>
            ))}
          </ul>
          {!state.viewer?.isReady ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => answerReady(true)}
              >
                Yes — start voting
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => answerReady(false)}
              >
                No — still adding
              </button>
            </div>
          ) : (
            <p className="mt-6 text-sm text-foam">
              You’re marked ready. Waiting for everyone else…
            </p>
          )}
        </section>
      ) : null}

      {state.room.phase === "vote" ? (
        <section className="mt-10 grid gap-8">
          <div>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">
                  Cast your votes
                </h2>
                <p className="mt-1 text-paper-dim">
                  Love or Okay counts as approval. A song needs{" "}
                  <span className="text-paper">
                    {requiredApprovals} of {state.participants.length}
                  </span>{" "}
                  approvals (80%). Vote on every song, then press Done.
                </p>
              </div>
              <p className="text-sm text-paper-dim">
                {votedCount}/{state.songs.length} voted ·{" "}
                {state.participants.filter((p) => p.votingDone).length}/
                {state.participants.length} done
              </p>
            </div>
            <ul className="grid gap-4">
              {voteSongs.length === 0 ? (
                <li className="panel p-4 text-sm text-paper-dim">
                  No songs in this round.
                </li>
              ) : null}
              {voteSongs.map((song) => {
                const current = myVote(song, state.viewer!.id);
                const summary = state.consensus.all.find(
                  (s) => s.id === song.id,
                );
                const isNew = newSongIds.has(song.id);
                const needsVote = !current;
                return (
                  <li
                    key={song.id}
                    className={`panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center ${
                      isNew ? "ring-1 ring-amber/60" : ""
                    } ${needsVote ? "" : "opacity-90"}`}
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
                        <p className="flex items-center gap-2 truncate font-semibold">
                          <span className="truncate">{song.name}</span>
                          {isNew ? (
                            <span className="shrink-0 rounded-full bg-amber/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber">
                              New
                            </span>
                          ) : null}
                          {needsVote ? (
                            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-foam">
                              Needs your vote
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-sm text-paper-dim">
                          {song.artists}
                          {song.nominatedByName
                            ? ` · ${song.nominatedByName}`
                            : ""}
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

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {!state.viewer?.votingDone ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || votedCount < state.songs.length}
                  onClick={markVotingDone}
                >
                  {votedCount < state.songs.length
                    ? `Done (${votedCount}/${state.songs.length})`
                    : "Done voting"}
                </button>
              ) : (
                <p className="text-sm text-foam">
                  You’re done. Waiting for everyone else to finish…
                </p>
              )}
            </div>
          </div>
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
                  ({requiredApprovals}+ of {state.participants.length}).
                  {state.room.spotifyPlaylistId
                    ? " Update will rewrite your linked Spotify playlist with these winners."
                    : " Link a Spotify playlist you own, then update it — or copy the text."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {state.room.spotifyPlaylistUrl ? (
                  <a
                    className="btn-ghost"
                    href={state.room.spotifyPlaylistUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Spotify
                  </a>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={copyWinningList}
                  disabled={state.consensus.playlist.length === 0}
                >
                  {listCopied ? "Copied" : "Copy playlist text"}
                </button>
                {state.isHost ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={
                      busy ||
                      state.consensus.playlist.length === 0 ||
                      spotifyReady === false
                    }
                    onClick={exportPlaylist}
                  >
                    {busy
                      ? "Opening Spotify…"
                      : state.room.spotifyPlaylistId
                        ? "Submit to Spotify playlist"
                        : "Export to Spotify"}
                  </button>
                ) : !state.room.spotifyPlaylistUrl ? (
                  <p className="text-sm text-paper-dim">
                    Waiting for host to submit to Spotify…
                  </p>
                ) : null}
              </div>
            </div>

            {state.isHost && !state.room.spotifyPlaylistId ? (
              <form
                className="mt-6 grid gap-2 border-t border-[var(--line)] pt-4"
                onSubmit={importPlaylist}
              >
                <label className="grid gap-1.5 text-sm text-paper-dim">
                  Link a Spotify playlist you own (blank OK), then Update
                  <input
                    className="field text-sm"
                    value={playlistUrl}
                    onChange={(e) => setPlaylistUrl(e.target.value)}
                    placeholder="https://open.spotify.com/playlist/…"
                    inputMode="url"
                  />
                </label>
                <button
                  type="submit"
                  className="btn-ghost justify-self-start px-4 py-2 text-sm"
                  disabled={busy || !playlistUrl.trim() || spotifyReady === false}
                >
                  {busy ? "Linking…" : "Link playlist"}
                </button>
              </form>
            ) : null}

            {importMessage ? (
              <p className="mt-4 rounded-xl border border-foam/40 bg-foam/10 px-3 py-2 text-sm text-foam">
                {importMessage}
                {state.room.spotifyPlaylistUrl ? (
                  <>
                    {" "}
                    <a
                      className="underline"
                      href={state.room.spotifyPlaylistUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open playlist
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}

            {spotifyReady === false ? (
              <p className="mt-4 text-sm text-amber">
                Spotify env vars missing on Render — search may use iTunes
                backup, and playlist update will stay unavailable.
              </p>
            ) : null}

            {state.consensus.playlist.some(
              (s) =>
                !s.spotifyTrackId || s.spotifyTrackId.includes(":"),
            ) ? (
              <p className="mt-4 text-sm text-amber">
                Some winners aren’t stored as Spotify track IDs (often from
                iTunes fallback). Export will try to match them on Spotify
                when you click the button.
              </p>
            ) : null}

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
                      {!song.spotifyTrackId ||
                      song.spotifyTrackId.includes(":")
                        ? " · not a Spotify track id"
                        : ""}
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
