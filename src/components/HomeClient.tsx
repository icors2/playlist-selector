"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  storeHostToken,
  storeParticipantToken,
} from "@/lib/session";

export function HomeClient() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [roomName, setRoomName] = useState("Group playlist");
  const [hostName, setHostName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          roomName,
          hostName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create room");
      storeParticipantToken(data.code, data.participantToken);
      storeHostToken(data.code, data.hostToken);
      router.push(`/room/${data.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          code: joinCode.trim().toUpperCase(),
          name: joinName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not join room");
      storeParticipantToken(data.code, data.participantToken);
      router.push(`/room/${data.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden stage-grain">
      <div className="hero-visual" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 pb-16 pt-6 sm:px-8">
        <header className="flex items-center justify-between animate-rise">
          <p className="font-display text-2xl font-extrabold tracking-tight text-paper sm:text-3xl">
            Okaylist
          </p>
          <p className="hidden text-sm text-paper-dim sm:block">
            80% of the group must approve
          </p>
        </header>

        <main className="mt-auto grid max-w-xl gap-6 pb-8 pt-24 sm:pb-16">
          <div>
            <h1 className="font-display animate-rise text-5xl font-extrabold leading-[0.95] tracking-tight text-paper sm:text-7xl">
              Okaylist
            </h1>
            <p className="animate-rise-delay mt-4 max-w-md text-lg text-paper-dim sm:text-xl">
              Nominate songs by hand, vote as a group, and build a playlist
              everyone mostly agrees on — then add the winners to Spotify
              yourself.
            </p>
          </div>

          <div className="animate-rise-delay-2 panel p-5 sm:p-6">
            <div className="mb-5 flex gap-2">
              <button
                type="button"
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  mode === "create"
                    ? "bg-amber text-ink"
                    : "bg-transparent text-paper-dim"
                }`}
                onClick={() => setMode("create")}
              >
                Start a room
              </button>
              <button
                type="button"
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  mode === "join"
                    ? "bg-amber text-ink"
                    : "bg-transparent text-paper-dim"
                }`}
                onClick={() => setMode("join")}
              >
                Join with code
              </button>
            </div>

            {mode === "create" ? (
              <form className="grid gap-3" onSubmit={onCreate}>
                <label className="grid gap-1.5 text-sm text-paper-dim">
                  Your name
                  <input
                    className="field"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    placeholder="Alex"
                    required
                    maxLength={40}
                  />
                </label>
                <label className="grid gap-1.5 text-sm text-paper-dim">
                  Room name
                  <input
                    className="field"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Friday hang"
                    required
                    maxLength={80}
                  />
                </label>
                <button className="btn-primary mt-2" disabled={loading}>
                  {loading ? "Opening room…" : "Create room"}
                </button>
              </form>
            ) : (
              <form className="grid gap-3" onSubmit={onJoin}>
                <label className="grid gap-1.5 text-sm text-paper-dim">
                  Room code
                  <input
                    className="field uppercase tracking-[0.2em]"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    required
                    maxLength={8}
                  />
                </label>
                <label className="grid gap-1.5 text-sm text-paper-dim">
                  Your name
                  <input
                    className="field"
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    placeholder="Sam"
                    required
                    maxLength={40}
                  />
                </label>
                <button className="btn-primary mt-2" disabled={loading}>
                  {loading ? "Joining…" : "Join room"}
                </button>
              </form>
            )}

            {error ? (
              <p className="mt-3 text-sm text-[#f0a090]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
