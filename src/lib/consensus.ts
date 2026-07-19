import type { Song, Vote, VoteValue } from "./models";

export type SongWithVotes = Song & {
  votes: Vote[];
  nominatedByName: string | null;
};

export type ConsensusSong = SongWithVotes & {
  loveCount: number;
  okayCount: number;
  passCount: number;
  voteCount: number;
  score: number;
  inPlaylist: boolean;
  pendingVoters: number;
};

export function summarizeSong(
  song: SongWithVotes,
  participantCount: number,
): ConsensusSong {
  let loveCount = 0;
  let okayCount = 0;
  let passCount = 0;

  for (const vote of song.votes) {
    if (vote.value === "love") loveCount += 1;
    else if (vote.value === "okay") okayCount += 1;
    else passCount += 1;
  }

  const voteCount = song.votes.length;
  const pendingVoters = Math.max(0, participantCount - voteCount);
  // Everyone is "okay" when there are zero vetoes and at least one vote.
  const inPlaylist = passCount === 0 && voteCount > 0;
  const score = loveCount * 2 + okayCount - passCount * 3;

  return {
    ...song,
    loveCount,
    okayCount,
    passCount,
    voteCount,
    score,
    inPlaylist,
    pendingVoters,
  };
}

export function buildConsensus(
  songs: SongWithVotes[],
  participantCount: number,
) {
  const summarized = songs.map((song) =>
    summarizeSong(song, participantCount),
  );

  const playlist = summarized
    .filter((s) => s.inPlaylist)
    .sort((a, b) => b.score - a.score || b.loveCount - a.loveCount);

  const vetoed = summarized
    .filter((s) => s.passCount > 0)
    .sort((a, b) => b.passCount - a.passCount);

  const pending = summarized.filter(
    (s) => s.passCount === 0 && s.voteCount === 0,
  );

  return { playlist, vetoed, pending, all: summarized };
}

export function myVote(
  song: { votes: { participantId: string; value: VoteValue }[] },
  participantId: string | null,
): VoteValue | null {
  if (!participantId) return null;
  return song.votes.find((v) => v.participantId === participantId)?.value ?? null;
}
