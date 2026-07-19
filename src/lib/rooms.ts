import type { SongWithVotes } from "./consensus";
import { createRoomCode, createToken } from "./ids";
import type { Room, RoomPhase, VoteValue } from "./models";
import {
  deleteSong,
  insertParticipant,
  insertRoom,
  insertSong,
  listParticipants,
  listRooms,
  listSongs,
  listVotes,
  sheetsConfigured,
  updateRoom,
  upsertVote,
} from "./sheets";

function newId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

export async function createRoom(name: string, hostName: string) {
  const code = createRoomCode();
  const hostToken = createToken();
  const participantToken = createToken();
  const roomId = newId();
  const createdAt = now();

  const room = await insertRoom({
    id: roomId,
    code,
    name: name.trim() || "Group playlist",
    hostToken,
    phase: "lobby",
    spotifyPlaylistId: null,
    spotifyPlaylistUrl: null,
    createdAt,
  });

  const host = await insertParticipant({
    id: newId(),
    roomId: room.id,
    name: hostName.trim() || "Host",
    token: participantToken,
    createdAt,
  });

  return { room, host, hostToken, participantToken };
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const rooms = await listRooms();
  return rooms.find((r) => r.code === code.toUpperCase()) ?? null;
}

export async function joinRoom(code: string, name: string) {
  const room = await getRoomByCode(code);
  if (!room) return { error: "Room not found" as const };
  if (room.phase === "results") {
    return { error: "This room already finished" as const };
  }

  const existing = await listParticipants(room.id);
  if (
    existing.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())
  ) {
    return { error: "That name is already taken in this room" as const };
  }

  const token = createToken();
  const participant = await insertParticipant({
    id: newId(),
    roomId: room.id,
    name: name.trim(),
    token,
    createdAt: now(),
  });

  return { room, participant, token };
}

export async function getParticipantByToken(token: string | null | undefined) {
  if (!token) return null;
  const all = await listParticipants();
  return all.find((p) => p.token === token) ?? null;
}

export async function loadRoom(
  code: string,
  options: {
    participantToken?: string | null;
    hostToken?: string | null;
  },
) {
  const room = await getRoomByCode(code);
  if (!room) return null;

  const memberList = (await listParticipants(room.id)).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const songRows = (await listSongs(room.id)).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const songIds = songRows.map((s) => s.id);
  const allVotes = await listVotes(songIds);

  const nameById = new Map(memberList.map((m) => [m.id, m.name]));
  const votesBySong = new Map<string, typeof allVotes>();
  for (const vote of allVotes) {
    const list = votesBySong.get(vote.songId) ?? [];
    list.push(vote);
    votesBySong.set(vote.songId, list);
  }

  const songsWithVotes: SongWithVotes[] = songRows.map((song) => ({
    ...song,
    votes: votesBySong.get(song.id) ?? [],
    nominatedByName: song.nominatedBy
      ? (nameById.get(song.nominatedBy) ?? null)
      : null,
  }));

  const viewer = await getParticipantByToken(options.participantToken);
  const isHost = Boolean(
    options.hostToken && options.hostToken === room.hostToken,
  );

  return {
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      phase: room.phase,
      spotifyPlaylistUrl: room.spotifyPlaylistUrl,
      createdAt: room.createdAt,
      storage: sheetsConfigured() ? ("sheets" as const) : ("memory" as const),
    },
    participants: memberList.map((m) => ({
      id: m.id,
      name: m.name,
      createdAt: m.createdAt,
    })),
    songs: songsWithVotes,
    viewer:
      viewer && viewer.roomId === room.id
        ? { id: viewer.id, name: viewer.name }
        : null,
    isHost,
  };
}

export async function setPhase(
  code: string,
  hostToken: string,
  phase: RoomPhase,
) {
  const room = await getRoomByCode(code);
  if (!room) return { error: "Room not found" as const };
  if (room.hostToken !== hostToken) {
    return { error: "Only the host can do that" as const };
  }

  const allowed: Record<RoomPhase, RoomPhase[]> = {
    lobby: ["nominate"],
    nominate: ["vote", "lobby"],
    vote: ["results", "nominate"],
    results: ["vote"],
  };

  if (!allowed[room.phase].includes(phase)) {
    return { error: `Cannot move from ${room.phase} to ${phase}` as const };
  }

  const updated = await updateRoom({ ...room, phase });
  return { room: updated };
}

export async function nominateSong(options: {
  code: string;
  participantToken: string;
  track: {
    id: string;
    name: string;
    artists: string;
    albumArt: string | null;
    previewUrl: string | null;
    durationMs: number;
  };
}) {
  const room = await getRoomByCode(options.code);
  if (!room) return { error: "Room not found" as const };
  if (room.phase !== "nominate") {
    return { error: "Nominations are closed" as const };
  }

  const participant = await getParticipantByToken(options.participantToken);
  if (!participant || participant.roomId !== room.id) {
    return { error: "Join the room first" as const };
  }

  const existing = await listSongs(room.id);
  if (existing.some((s) => s.spotifyTrackId === options.track.id)) {
    return { error: "That song is already on the list" as const };
  }

  const song = await insertSong({
    id: newId(),
    roomId: room.id,
    spotifyTrackId: options.track.id,
    name: options.track.name,
    artists: options.track.artists,
    albumArt: options.track.albumArt,
    previewUrl: options.track.previewUrl,
    durationMs: options.track.durationMs,
    nominatedBy: participant.id,
    createdAt: now(),
  });

  return { song };
}

export async function removeSong(options: {
  code: string;
  participantToken: string;
  hostToken?: string | null;
  songId: string;
}) {
  const room = await getRoomByCode(options.code);
  if (!room) return { error: "Room not found" as const };
  if (room.phase !== "nominate" && room.phase !== "lobby") {
    return { error: "Songs can only be removed during nominations" as const };
  }

  const participant = await getParticipantByToken(options.participantToken);
  const isHost = options.hostToken === room.hostToken;
  if (!participant || participant.roomId !== room.id) {
    return { error: "Join the room first" as const };
  }

  const songs = await listSongs(room.id);
  const song = songs.find((s) => s.id === options.songId);
  if (!song) return { error: "Song not found" as const };
  if (!isHost && song.nominatedBy !== participant.id) {
    return { error: "You can only remove songs you added" as const };
  }

  await deleteSong(song.id);
  return { ok: true as const };
}

export async function castVote(options: {
  code: string;
  participantToken: string;
  songId: string;
  value: VoteValue;
}) {
  const room = await getRoomByCode(options.code);
  if (!room) return { error: "Room not found" as const };
  if (room.phase !== "vote") return { error: "Voting is not open" as const };

  const participant = await getParticipantByToken(options.participantToken);
  if (!participant || participant.roomId !== room.id) {
    return { error: "Join the room first" as const };
  }

  const songs = await listSongs(room.id);
  if (!songs.some((s) => s.id === options.songId)) {
    return { error: "Song not found" as const };
  }

  const vote = await upsertVote({
    id: newId(),
    songId: options.songId,
    participantId: participant.id,
    value: options.value,
    createdAt: now(),
  });

  return { vote };
}

export async function savePlaylistLink(
  code: string,
  hostToken: string,
  playlist: { id: string; url: string },
) {
  const room = await getRoomByCode(code);
  if (!room) return { error: "Room not found" as const };
  if (room.hostToken !== hostToken) {
    return { error: "Only the host can export" as const };
  }

  const updated = await updateRoom({
    ...room,
    spotifyPlaylistId: playlist.id,
    spotifyPlaylistUrl: playlist.url,
  });

  return { room: updated };
}
