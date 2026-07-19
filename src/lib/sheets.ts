import type { Participant, Room, Song, Vote } from "./models";

type MemoryStore = {
  rooms: Room[];
  participants: Participant[];
  songs: Song[];
  votes: Vote[];
};

const globalStore = globalThis as unknown as {
  okaylistMemory?: MemoryStore;
};

function memory(): MemoryStore {
  if (!globalStore.okaylistMemory) {
    globalStore.okaylistMemory = {
      rooms: [],
      participants: [],
      songs: [],
      votes: [],
    };
  }
  return globalStore.okaylistMemory;
}

export function sheetsConfigured() {
  return Boolean(
    process.env.GOOGLE_APPS_SCRIPT_URL && process.env.GOOGLE_APPS_SCRIPT_SECRET,
  );
}

type ScriptResponse = {
  error?: string;
  rooms?: Room[];
  room?: Room;
  participants?: Participant[];
  participant?: Participant;
  songs?: Song[];
  song?: Song;
  votes?: Vote[];
  vote?: Vote;
  ok?: boolean;
};

async function callScript<T extends ScriptResponse>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL;
  const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET;
  if (!url || !secret) {
    throw new Error("Google Apps Script is not configured");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, secret, ...payload }),
    redirect: "follow",
    cache: "no-store",
  });

  const data = (await res.json()) as T;
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

/** -------- Public store API -------- */

export async function listRooms(): Promise<Room[]> {
  if (!sheetsConfigured()) return memory().rooms;
  const data = await callScript("listRooms");
  return data.rooms ?? [];
}

export async function insertRoom(room: Room) {
  if (!sheetsConfigured()) {
    memory().rooms.push(room);
    return room;
  }
  const data = await callScript("insertRoom", { room });
  return data.room ?? room;
}

export async function updateRoom(room: Room) {
  if (!sheetsConfigured()) {
    const store = memory();
    const idx = store.rooms.findIndex((r) => r.id === room.id);
    if (idx >= 0) store.rooms[idx] = room;
    return room;
  }
  const data = await callScript("updateRoom", { room });
  return data.room ?? room;
}

export async function listParticipants(roomId?: string): Promise<Participant[]> {
  if (!sheetsConfigured()) {
    const all = memory().participants;
    return roomId ? all.filter((p) => p.roomId === roomId) : all;
  }
  const data = await callScript("listParticipants", { roomId: roomId ?? null });
  return data.participants ?? [];
}

export async function insertParticipant(participant: Participant) {
  if (!sheetsConfigured()) {
    memory().participants.push(participant);
    return participant;
  }
  const data = await callScript("insertParticipant", { participant });
  return data.participant ?? participant;
}

export async function listSongs(roomId?: string): Promise<Song[]> {
  if (!sheetsConfigured()) {
    const all = memory().songs;
    return roomId ? all.filter((s) => s.roomId === roomId) : all;
  }
  const data = await callScript("listSongs", { roomId: roomId ?? null });
  return data.songs ?? [];
}

export async function insertSong(song: Song) {
  if (!sheetsConfigured()) {
    memory().songs.push(song);
    return song;
  }
  const data = await callScript("insertSong", { song });
  return data.song ?? song;
}

export async function deleteSong(songId: string) {
  if (!sheetsConfigured()) {
    const store = memory();
    store.songs = store.songs.filter((s) => s.id !== songId);
    store.votes = store.votes.filter((v) => v.songId !== songId);
    return;
  }
  await callScript("deleteSong", { songId });
}

export async function listVotes(songIds?: string[]): Promise<Vote[]> {
  if (!sheetsConfigured()) {
    const all = memory().votes;
    if (!songIds) return all;
    const set = new Set(songIds);
    return all.filter((v) => set.has(v.songId));
  }
  const data = await callScript("listVotes", { songIds: songIds ?? null });
  return data.votes ?? [];
}

export async function upsertVote(vote: Vote) {
  if (!sheetsConfigured()) {
    const store = memory();
    const idx = store.votes.findIndex(
      (v) =>
        v.songId === vote.songId && v.participantId === vote.participantId,
    );
    if (idx >= 0) {
      store.votes[idx] = { ...store.votes[idx], value: vote.value };
      return store.votes[idx];
    }
    store.votes.push(vote);
    return vote;
  }
  const data = await callScript("upsertVote", { vote });
  return data.vote ?? vote;
}
