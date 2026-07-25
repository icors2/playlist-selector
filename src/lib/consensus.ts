import type { Song, Vote, VoteValue } from "./models";

/** Songs need this share of the room to approve (Love or Okay). */
export const APPROVAL_THRESHOLD = 0.8;

export type SongWithVotes = Song & {
  votes: Vote[];
  nominatedByName: string | null;
};

export type ConsensusSong = SongWithVotes & {
  loveCount: number;
  okayCount: number;
  passCount: number;
  voteCount: number;
  approveCount: number;
  approvalRatio: number;
  requiredApprovals: number;
  score: number;
  inPlaylist: boolean;
  pendingVoters: number;
};

export function requiredApprovalsFor(participantCount: number) {
  const n = Math.max(1, participantCount);
  return Math.ceil(n * APPROVAL_THRESHOLD);
}

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
  const approveCount = loveCount + okayCount;
  const pendingVoters = Math.max(0, participantCount - voteCount);
  const requiredApprovals = requiredApprovalsFor(participantCount);
  const groupSize = Math.max(1, participantCount);
  const approvalRatio = approveCount / groupSize;
  // 80% of the whole group must approve (Love or Okay).
  const inPlaylist = approveCount >= requiredApprovals;
  const score = loveCount * 2 + okayCount - passCount * 3;

  return {
    ...song,
    loveCount,
    okayCount,
    passCount,
    voteCount,
    approveCount,
    approvalRatio,
    requiredApprovals,
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

  const rejected = summarized
    .filter((s) => !s.inPlaylist && s.voteCount > 0)
    .sort((a, b) => b.approvalRatio - a.approvalRatio);

  const pending = summarized.filter((s) => s.voteCount === 0);

  return {
    playlist,
    vetoed: rejected,
    pending,
    all: summarized,
    threshold: APPROVAL_THRESHOLD,
    requiredApprovals: requiredApprovalsFor(participantCount),
  };
}

export function myVote(
  song: { votes: { participantId: string; value: VoteValue }[] },
  participantId: string | null,
): VoteValue | null {
  if (!participantId) return null;
  return song.votes.find((v) => v.participantId === participantId)?.value ?? null;
}

export function formatApproval(song: ConsensusSong) {
  return `${song.approveCount}/${song.requiredApprovals} approvals`;
}
