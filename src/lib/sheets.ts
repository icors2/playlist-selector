import { google, type sheets_v4 } from "googleapis";
import type { Participant, Room, RoomPhase, Song, Vote, VoteValue } from "./models";

const TAB = {
  rooms: "Rooms",
  participants: "Participants",
  songs: "Songs",
  votes: "Votes",
} as const;

const HEADERS = {
  rooms: [
    "id",
    "code",
    "name",
    "host_token",
    "phase",
    "spotify_playlist_id",
    "spotify_playlist_url",
    "created_at",
  ],
  participants: ["id", "room_id", "name", "token", "created_at"],
  songs: [
    "id",
    "room_id",
    "spotify_track_id",
    "name",
    "artists",
    "album_art",
    "preview_url",
    "duration_ms",
    "nominated_by",
    "created_at",
  ],
  votes: ["id", "song_id", "participant_id", "value", "created_at"],
} as const;

type MemoryStore = {
  rooms: Room[];
  participants: Participant[];
  songs: Song[];
  votes: Vote[];
};

const globalStore = globalThis as unknown as {
  okaylistMemory?: MemoryStore;
  okaylistSheetsReady?: boolean;
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
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY,
  );
}

function privateKey() {
  return (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
}

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function spreadsheetId() {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
}

function emptyToNull(value: string | undefined) {
  if (value === undefined || value === "") return null;
  return value;
}

function roomFromRow(row: string[]): Room {
  return {
    id: row[0] ?? "",
    code: row[1] ?? "",
    name: row[2] ?? "",
    hostToken: row[3] ?? "",
    phase: (row[4] as RoomPhase) || "lobby",
    spotifyPlaylistId: emptyToNull(row[5]),
    spotifyPlaylistUrl: emptyToNull(row[6]),
    createdAt: row[7] ?? new Date().toISOString(),
  };
}

function participantFromRow(row: string[]): Participant {
  return {
    id: row[0] ?? "",
    roomId: row[1] ?? "",
    name: row[2] ?? "",
    token: row[3] ?? "",
    createdAt: row[4] ?? new Date().toISOString(),
  };
}

function songFromRow(row: string[]): Song {
  return {
    id: row[0] ?? "",
    roomId: row[1] ?? "",
    spotifyTrackId: row[2] ?? "",
    name: row[3] ?? "",
    artists: row[4] ?? "",
    albumArt: emptyToNull(row[5]),
    previewUrl: emptyToNull(row[6]),
    durationMs: Number(row[7] || 0),
    nominatedBy: emptyToNull(row[8]),
    createdAt: row[9] ?? new Date().toISOString(),
  };
}

function voteFromRow(row: string[]): Vote {
  return {
    id: row[0] ?? "",
    songId: row[1] ?? "",
    participantId: row[2] ?? "",
    value: (row[3] as VoteValue) || "okay",
    createdAt: row[4] ?? new Date().toISOString(),
  };
}

function roomToRow(room: Room): string[] {
  return [
    room.id,
    room.code,
    room.name,
    room.hostToken,
    room.phase,
    room.spotifyPlaylistId ?? "",
    room.spotifyPlaylistUrl ?? "",
    room.createdAt,
  ];
}

function participantToRow(p: Participant): string[] {
  return [p.id, p.roomId, p.name, p.token, p.createdAt];
}

function songToRow(song: Song): string[] {
  return [
    song.id,
    song.roomId,
    song.spotifyTrackId,
    song.name,
    song.artists,
    song.albumArt ?? "",
    song.previewUrl ?? "",
    String(song.durationMs),
    song.nominatedBy ?? "",
    song.createdAt,
  ];
}

function voteToRow(vote: Vote): string[] {
  return [
    vote.id,
    vote.songId,
    vote.participantId,
    vote.value,
    vote.createdAt,
  ];
}

async function ensureTabs(sheets: sheets_v4.Sheets) {
  if (globalStore.okaylistSheetsReady) return;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: spreadsheetId(),
  });
  const existing = new Set(
    (meta.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean),
  );

  const requests: sheets_v4.Schema$Request[] = [];
  for (const title of Object.values(TAB)) {
    if (!existing.has(title)) {
      requests.push({ addSheet: { properties: { title } } });
    }
  }
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: { requests },
    });
  }

  for (const [key, title] of Object.entries(TAB) as [
    keyof typeof HEADERS,
    string,
  ][]) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId(),
      range: `${title}!A1:Z1`,
    });
    const header = res.data.values?.[0];
    if (!header || header.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId(),
        range: `${title}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADERS[key] as unknown as string[]] },
      });
    }
  }

  globalStore.okaylistSheetsReady = true;
}

async function readRows(tab: string): Promise<{ rows: string[][]; startRow: number }> {
  const sheets = await getSheetsClient();
  await ensureTabs(sheets);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${tab}!A2:Z`,
  });
  const rows = (res.data.values ?? []).map((row) =>
    row.map((cell) => String(cell ?? "")),
  );
  return { rows, startRow: 2 };
}

async function appendRow(tab: string, values: string[]) {
  const sheets = await getSheetsClient();
  await ensureTabs(sheets);
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${tab}!A:Z`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

async function updateRow(tab: string, rowNumber: number, values: string[]) {
  const sheets = await getSheetsClient();
  await ensureTabs(sheets);
  await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${tab}!A${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [values] },
  });
}

async function deleteRow(tab: string, rowNumber: number) {
  const sheets = await getSheetsClient();
  await ensureTabs(sheets);
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: spreadsheetId(),
  });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === tab);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error(`Sheet tab not found: ${tab}`);
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}

/** -------- Public store API -------- */

export async function listRooms(): Promise<Room[]> {
  if (!sheetsConfigured()) return memory().rooms;
  const { rows } = await readRows(TAB.rooms);
  return rows.map(roomFromRow).filter((r) => r.id);
}

export async function insertRoom(room: Room) {
  if (!sheetsConfigured()) {
    memory().rooms.push(room);
    return room;
  }
  await appendRow(TAB.rooms, roomToRow(room));
  return room;
}

export async function updateRoom(room: Room) {
  if (!sheetsConfigured()) {
    const store = memory();
    const idx = store.rooms.findIndex((r) => r.id === room.id);
    if (idx >= 0) store.rooms[idx] = room;
    return room;
  }
  const { rows, startRow } = await readRows(TAB.rooms);
  const index = rows.findIndex((r) => r[0] === room.id);
  if (index < 0) throw new Error("Room not found");
  await updateRow(TAB.rooms, startRow + index, roomToRow(room));
  return room;
}

export async function listParticipants(roomId?: string): Promise<Participant[]> {
  if (!sheetsConfigured()) {
    const all = memory().participants;
    return roomId ? all.filter((p) => p.roomId === roomId) : all;
  }
  const { rows } = await readRows(TAB.participants);
  const all = rows.map(participantFromRow).filter((p) => p.id);
  return roomId ? all.filter((p) => p.roomId === roomId) : all;
}

export async function insertParticipant(participant: Participant) {
  if (!sheetsConfigured()) {
    memory().participants.push(participant);
    return participant;
  }
  await appendRow(TAB.participants, participantToRow(participant));
  return participant;
}

export async function listSongs(roomId?: string): Promise<Song[]> {
  if (!sheetsConfigured()) {
    const all = memory().songs;
    return roomId ? all.filter((s) => s.roomId === roomId) : all;
  }
  const { rows } = await readRows(TAB.songs);
  const all = rows.map(songFromRow).filter((s) => s.id);
  return roomId ? all.filter((s) => s.roomId === roomId) : all;
}

export async function insertSong(song: Song) {
  if (!sheetsConfigured()) {
    memory().songs.push(song);
    return song;
  }
  await appendRow(TAB.songs, songToRow(song));
  return song;
}

export async function deleteSong(songId: string) {
  if (!sheetsConfigured()) {
    const store = memory();
    store.songs = store.songs.filter((s) => s.id !== songId);
    store.votes = store.votes.filter((v) => v.songId !== songId);
    return;
  }
  const songData = await readRows(TAB.songs);
  const songIndex = songData.rows.findIndex((r) => r[0] === songId);
  if (songIndex >= 0) {
    await deleteRow(TAB.songs, songData.startRow + songIndex);
  }

  // Remove votes for this song (iterate from bottom to keep indices stable)
  const voteData = await readRows(TAB.votes);
  const voteIndexes = voteData.rows
    .map((row, i) => (row[1] === songId ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => b - a);
  for (const index of voteIndexes) {
    await deleteRow(TAB.votes, voteData.startRow + index);
  }
}

export async function listVotes(songIds?: string[]): Promise<Vote[]> {
  if (!sheetsConfigured()) {
    const all = memory().votes;
    if (!songIds) return all;
    const set = new Set(songIds);
    return all.filter((v) => set.has(v.songId));
  }
  const { rows } = await readRows(TAB.votes);
  const all = rows.map(voteFromRow).filter((v) => v.id);
  if (!songIds) return all;
  const set = new Set(songIds);
  return all.filter((v) => set.has(v.songId));
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

  const { rows, startRow } = await readRows(TAB.votes);
  const index = rows.findIndex(
    (r) => r[1] === vote.songId && r[2] === vote.participantId,
  );
  if (index >= 0) {
    const existing = voteFromRow(rows[index]);
    const updated = { ...existing, value: vote.value };
    await updateRow(TAB.votes, startRow + index, voteToRow(updated));
    return updated;
  }
  await appendRow(TAB.votes, voteToRow(vote));
  return vote;
}
