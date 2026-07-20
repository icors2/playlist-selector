import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roomPhaseEnum = pgEnum("room_phase", [
  "lobby",
  "nominate",
  "vote",
  "results",
]);

export const voteValueEnum = pgEnum("vote_value", [
  "love",
  "okay",
  "pass",
]);

export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  hostToken: text("host_token").notNull(),
  phase: roomPhaseEnum("phase").notNull().default("lobby"),
  spotifyPlaylistId: text("spotify_playlist_id"),
  spotifyPlaylistUrl: text("spotify_playlist_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("participants_room_name_idx").on(table.roomId, table.name),
  ],
);

export const songs = pgTable(
  "songs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    spotifyTrackId: text("spotify_track_id").notNull(),
    name: text("name").notNull(),
    artists: text("artists").notNull(),
    albumArt: text("album_art"),
    previewUrl: text("preview_url"),
    durationMs: integer("duration_ms").notNull().default(0),
    nominatedBy: uuid("nominated_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("songs_room_track_idx").on(table.roomId, table.spotifyTrackId),
  ],
);

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    value: voteValueEnum("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("votes_song_participant_idx").on(
      table.songId,
      table.participantId,
    ),
  ],
);
