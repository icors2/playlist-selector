ALTER TYPE "public"."room_phase" ADD VALUE IF NOT EXISTS 'ready';--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "is_ready" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "voting_done" boolean DEFAULT false NOT NULL;
