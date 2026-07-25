import type { ConsensusSong } from "./consensus";
import type { RoomPhase, VoteValue } from "./models";

export type RoomStateResponse = {
  room: {
    id: string;
    code: string;
    name: string;
    phase: RoomPhase;
    spotifyPlaylistId: string | null;
    spotifyPlaylistUrl: string | null;
    createdAt: string;
    storage?: "database" | "memory";
  };
  participants: {
    id: string;
    name: string;
    isReady: boolean;
    votingDone: boolean;
    createdAt: string;
  }[];
  songs: {
    id: string;
    spotifyTrackId: string;
    name: string;
    artists: string;
    albumArt: string | null;
    previewUrl: string | null;
    durationMs: number;
    nominatedBy: string | null;
    nominatedByName: string | null;
    createdAt: string;
    votes: {
      id: string;
      songId: string;
      participantId: string;
      value: VoteValue;
    }[];
  }[];
  viewer: {
    id: string;
    name: string;
    isReady: boolean;
    votingDone: boolean;
  } | null;
  isHost: boolean;
  consensus: {
    playlist: ConsensusSong[];
    vetoed: ConsensusSong[];
    pending: ConsensusSong[];
    all: ConsensusSong[];
    threshold?: number;
    requiredApprovals?: number;
  };
};

export type SearchTrack = {
  id: string;
  name: string;
  artists: string;
  albumArt: string | null;
  previewUrl: string | null;
  durationMs: number;
  uri: string;
};
