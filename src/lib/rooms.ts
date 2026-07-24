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
  storeConfigured,
  updateRoom,
  upsertVote,
} from "./store";

function newId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

export async function createRoom(
  name: string,
  hostName: string,
  options?: {
    spotifyPlaylistId?: string | null;
    spotifyPlaylistUrl?: string | null;
  },
) {
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
    spotifyPlaylistId: options?.spotifyPlaylistId ?? null,
    spotifyPlaylistUrl: options?.spotifyPlaylistUrl ?? null,
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
  const all = await listRooms();
  return all.find((r) => r.code === code.toUpperCase()) ?? null;
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
      spotifyPlaylistId: room.spotifyPlaylistId,
      spotifyPlaylistUrl: room.spotifyPlaylistUrl,
      createdAt: room.createdAt,
      storage: storeConfigured() ? ("database" as const) : ("memory" as const),
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

function manualTrackId(name: string, artists: string) {
  const key = `${name.trim().toLowerCase()}::${artists.trim().toLowerCase()}`;
  // Stable id so re-adding the same typed song hits the duplicate check.
  return `manual:${Buffer.from(key).toString("base64url").slice(0, 48)}`;
}

export async function nominateSong(options: {
  code: string;
  participantToken: string;
  track: {
    id?: string;
    name: string;
    artists: string;
    albumArt: string | null;
    previewUrl: string | null;
    durationMs: number;
  };
}) {
  const room = await getRoomByCode(options.code);
  if (!room) return { error: "Room not found" as const };
  // Keep nominations open during voting so the group can keep adding songs.
  if (room.phase !== "nominate" && room.phase !== "vote") {
    return { error: "Nominations are closed" as const };
  }

  const participant = await getParticipantByToken(options.participantToken);
  if (!participant || participant.roomId !== room.id) {
    return { error: "Join the room first" as const };
  }

  const name = options.track.name.trim();
  const artists = options.track.artists.trim();
  if (!name || !artists) {
    return { error: "Song title and artist are required" as const };
  }

  const trackId =
    options.track.id?.trim() || manualTrackId(name, artists);

  const existing = await listSongs(room.id);
  if (
    existing.some(
      (s) =>
        s.spotifyTrackId === trackId ||
        (s.name.toLowerCase() === name.toLowerCase() &&
          s.artists.toLowerCase() === artists.toLowerCase()),
    )
  ) {
    return { error: "That song is already on the list" as const };
  }

  const song = await insertSong({
    id: newId(),
    roomId: room.id,
    spotifyTrackId: trackId,
    name,
    artists,
    albumArt: options.track.albumArt,
    previewUrl: options.track.previewUrl,
    durationMs: options.track.durationMs,
    nominatedBy: participant.id,
    createdAt: now(),
  });

  return { song };
}

export async function importPlaylistTracks(options: {
  code: string;
  hostToken: string;
  participantToken: string;
  playlist: {
    id: string;
    url: string;
    name: string;
    tracks: {
      id: string;
      name: string;
      artists: string;
      albumArt: string | null;
      previewUrl: string | null;
      durationMs: number;
    }[];
  };
}) {
  const room = await getRoomByCode(options.code);
  if (!room) return { error: "Room not found" as const };
  if (room.hostToken !== options.hostToken) {
    return { error: "Only the host can import a playlist" as const };
  }
  // Link/import before voting, or link during results so export can update it.
  if (room.phase === "vote") {
    return {
      error: "Pause voting (or finish) before changing the linked playlist" as const,
    };
  }

  const participant = await getParticipantByToken(options.participantToken);
  if (!participant || participant.roomId !== room.id) {
    return { error: "Join the room first" as const };
  }

  const nextPhase =
    room.phase === "lobby"
      ? ("nominate" as const)
      : room.phase;

  await updateRoom({
    ...room,
    name:
      room.name === "Group playlist" && options.playlist.tracks.length > 0
        ? options.playlist.name
        : room.name,
    spotifyPlaylistId: options.playlist.id,
    spotifyPlaylistUrl: options.playlist.url,
    phase: nextPhase,
  });

  // During results we only link the playlist for export (no new nominations).
  if (room.phase === "results") {
    return {
      added: 0,
      skipped: 0,
      total: options.playlist.tracks.length,
      playlistName: options.playlist.name,
      playlistUrl: options.playlist.url,
      linkedOnly: true as const,
    };
  }

  const existing = await listSongs(room.id);
  const existingIds = new Set(existing.map((s) => s.spotifyTrackId));
  let added = 0;
  let skipped = 0;

  for (const track of options.playlist.tracks) {
    if (existingIds.has(track.id)) {
      skipped += 1;
      continue;
    }
    await insertSong({
      id: newId(),
      roomId: room.id,
      spotifyTrackId: track.id,
      name: track.name,
      artists: track.artists,
      albumArt: track.albumArt,
      previewUrl: track.previewUrl,
      durationMs: track.durationMs,
      nominatedBy: participant.id,
      createdAt: now(),
    });
    existingIds.add(track.id);
    added += 1;
  }

  return {
    added,
    skipped,
    total: options.playlist.tracks.length,
    playlistName: options.playlist.name,
    playlistUrl: options.playlist.url,
    linkedOnly: options.playlist.tracks.length === 0,
  };
}

export async function removeSong(options: {
  code: string;
  participantToken: string;
  hostToken?: string | null;
  songId: string;
}) {
  const room = await getRoomByCode(options.code);
  if (!room) return { error: "Room not found" as const };
  if (
    room.phase !== "nominate" &&
    room.phase !== "lobby" &&
    room.phase !== "vote"
  ) {
    return { error: "Songs can only be removed before results" as const };
  }

  const participant = await getParticipantByToken(options.participantToken);
  const isHost = options.hostToken === room.hostToken;
  if (!participant || participant.roomId !== room.id) {
    return { error: "Join the room first" as const };
  }

  const songList = await listSongs(room.id);
  const song = songList.find((s) => s.id === options.songId);
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

  const songList = await listSongs(room.id);
  if (!songList.some((s) => s.id === options.songId)) {
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
