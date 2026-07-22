import { and, eq, inArray } from "drizzle-orm";
import { db, dbConfigured } from "../../db";
import { participants, rooms, songs, votes } from "../../db/schema";
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

export function storeConfigured() {
  return dbConfigured() && Boolean(db);
}

function mapRoom(row: typeof rooms.$inferSelect): Room {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    hostToken: row.hostToken,
    phase: row.phase,
    spotifyPlaylistId: row.spotifyPlaylistId,
    spotifyPlaylistUrl: row.spotifyPlaylistUrl,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}

function mapParticipant(row: typeof participants.$inferSelect): Participant {
  return {
    id: row.id,
    roomId: row.roomId,
    name: row.name,
    token: row.token,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}

function mapSong(row: typeof songs.$inferSelect): Song {
  return {
    id: row.id,
    roomId: row.roomId,
    spotifyTrackId: row.spotifyTrackId,
    name: row.name,
    artists: row.artists,
    albumArt: row.albumArt,
    previewUrl: row.previewUrl,
    durationMs: row.durationMs,
    nominatedBy: row.nominatedBy,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}

function mapVote(row: typeof votes.$inferSelect): Vote {
  return {
    id: row.id,
    songId: row.songId,
    participantId: row.participantId,
    value: row.value,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}

export async function listRooms(): Promise<Room[]> {
  if (!db) return memory().rooms;
  const rows = await db.select().from(rooms);
  return rows.map(mapRoom);
}

export async function insertRoom(room: Room) {
  if (!db) {
    memory().rooms.push(room);
    return room;
  }
  const [row] = await db
    .insert(rooms)
    .values({
      id: room.id,
      code: room.code,
      name: room.name,
      hostToken: room.hostToken,
      phase: room.phase,
      spotifyPlaylistId: room.spotifyPlaylistId,
      spotifyPlaylistUrl: room.spotifyPlaylistUrl,
      createdAt: new Date(room.createdAt),
    })
    .returning();
  return mapRoom(row);
}

export async function updateRoom(room: Room) {
  if (!db) {
    const store = memory();
    const idx = store.rooms.findIndex((r) => r.id === room.id);
    if (idx >= 0) store.rooms[idx] = room;
    return room;
  }
  const [row] = await db
    .update(rooms)
    .set({
      name: room.name,
      phase: room.phase,
      spotifyPlaylistId: room.spotifyPlaylistId,
      spotifyPlaylistUrl: room.spotifyPlaylistUrl,
    })
    .where(eq(rooms.id, room.id))
    .returning();
  return mapRoom(row);
}

export async function listParticipants(roomId?: string): Promise<Participant[]> {
  if (!db) {
    const all = memory().participants;
    return roomId ? all.filter((p) => p.roomId === roomId) : all;
  }
  const rows = roomId
    ? await db.select().from(participants).where(eq(participants.roomId, roomId))
    : await db.select().from(participants);
  return rows.map(mapParticipant);
}

export async function insertParticipant(participant: Participant) {
  if (!db) {
    memory().participants.push(participant);
    return participant;
  }
  const [row] = await db
    .insert(participants)
    .values({
      id: participant.id,
      roomId: participant.roomId,
      name: participant.name,
      token: participant.token,
      createdAt: new Date(participant.createdAt),
    })
    .returning();
  return mapParticipant(row);
}

export async function listSongs(roomId?: string): Promise<Song[]> {
  if (!db) {
    const all = memory().songs;
    return roomId ? all.filter((s) => s.roomId === roomId) : all;
  }
  const rows = roomId
    ? await db.select().from(songs).where(eq(songs.roomId, roomId))
    : await db.select().from(songs);
  return rows.map(mapSong);
}

export async function insertSong(song: Song) {
  if (!db) {
    memory().songs.push(song);
    return song;
  }
  const [row] = await db
    .insert(songs)
    .values({
      id: song.id,
      roomId: song.roomId,
      spotifyTrackId: song.spotifyTrackId,
      name: song.name,
      artists: song.artists,
      albumArt: song.albumArt,
      previewUrl: song.previewUrl,
      durationMs: song.durationMs,
      nominatedBy: song.nominatedBy,
      createdAt: new Date(song.createdAt),
    })
    .returning();
  return mapSong(row);
}

export async function deleteSong(songId: string) {
  if (!db) {
    const store = memory();
    store.songs = store.songs.filter((s) => s.id !== songId);
    store.votes = store.votes.filter((v) => v.songId !== songId);
    return;
  }
  await db.delete(votes).where(eq(votes.songId, songId));
  await db.delete(songs).where(eq(songs.id, songId));
}

export async function listVotes(songIds?: string[]): Promise<Vote[]> {
  if (!db) {
    const all = memory().votes;
    if (!songIds) return all;
    const set = new Set(songIds);
    return all.filter((v) => set.has(v.songId));
  }
  if (!songIds || songIds.length === 0) {
    const rows = await db.select().from(votes);
    return rows.map(mapVote);
  }
  const rows = await db
    .select()
    .from(votes)
    .where(inArray(votes.songId, songIds));
  return rows.map(mapVote);
}

export async function upsertVote(vote: Vote) {
  if (!db) {
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

  const [existing] = await db
    .select()
    .from(votes)
    .where(
      and(
        eq(votes.songId, vote.songId),
        eq(votes.participantId, vote.participantId),
      ),
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(votes)
      .set({ value: vote.value })
      .where(eq(votes.id, existing.id))
      .returning();
    return mapVote(row);
  }

  const [row] = await db
    .insert(votes)
    .values({
      id: vote.id,
      songId: vote.songId,
      participantId: vote.participantId,
      value: vote.value,
      createdAt: new Date(vote.createdAt),
    })
    .returning();
  return mapVote(row);
}
