export type RoomPhase = "lobby" | "nominate" | "vote" | "results";
export type VoteValue = "love" | "okay" | "pass";

export type Room = {
  id: string;
  code: string;
  name: string;
  hostToken: string;
  phase: RoomPhase;
  spotifyPlaylistId: string | null;
  spotifyPlaylistUrl: string | null;
  createdAt: string;
};

export type Participant = {
  id: string;
  roomId: string;
  name: string;
  token: string;
  createdAt: string;
};

export type Song = {
  id: string;
  roomId: string;
  spotifyTrackId: string;
  name: string;
  artists: string;
  albumArt: string | null;
  previewUrl: string | null;
  durationMs: number;
  nominatedBy: string | null;
  createdAt: string;
};

export type Vote = {
  id: string;
  songId: string;
  participantId: string;
  value: VoteValue;
  createdAt: string;
};
