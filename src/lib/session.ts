const PARTICIPANT_KEY = "okaylist_participant";
const HOST_KEY = "okaylist_host";

export function getStoredTokens(code: string) {
  if (typeof window === "undefined") {
    return { participantToken: null, hostToken: null };
  }
  return {
    participantToken: localStorage.getItem(`${PARTICIPANT_KEY}:${code}`),
    hostToken: localStorage.getItem(`${HOST_KEY}:${code}`),
  };
}

export function storeParticipantToken(code: string, token: string) {
  localStorage.setItem(`${PARTICIPANT_KEY}:${code}`, token);
}

export function storeHostToken(code: string, token: string) {
  localStorage.setItem(`${HOST_KEY}:${code}`, token);
}

export function authHeaders(code: string): HeadersInit {
  const { participantToken, hostToken } = getStoredTokens(code);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (participantToken) headers["x-participant-token"] = participantToken;
  if (hostToken) headers["x-host-token"] = hostToken;
  return headers;
}
