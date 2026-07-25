/** Shared password required to create or join a room. */
export function expectedRoomPassword() {
  return process.env.ROOM_ACCESS_PASSWORD?.trim() || "Momrules1!";
}

export function roomPasswordOk(password: unknown): boolean {
  if (typeof password !== "string") return false;
  return password === expectedRoomPassword();
}
