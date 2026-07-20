CREATE TYPE "room_phase" AS ENUM('lobby', 'nominate', 'vote', 'results');--> statement-breakpoint
CREATE TYPE "vote_value" AS ENUM('love', 'okay', 'pass');--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"room_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"host_token" text NOT NULL,
	"phase" "room_phase" DEFAULT 'lobby'::"room_phase" NOT NULL,
	"spotify_playlist_id" text,
	"spotify_playlist_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"room_id" uuid NOT NULL,
	"spotify_track_id" text NOT NULL,
	"name" text NOT NULL,
	"artists" text NOT NULL,
	"album_art" text,
	"preview_url" text,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"nominated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"song_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"value" "vote_value" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "participants_room_name_idx" ON "participants" ("room_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "songs_room_track_idx" ON "songs" ("room_id","spotify_track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_song_participant_idx" ON "votes" ("song_id","participant_id");--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_nominated_by_participants_id_fkey" FOREIGN KEY ("nominated_by") REFERENCES "participants"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_song_id_songs_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_participant_id_participants_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE;