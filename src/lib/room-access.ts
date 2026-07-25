/** Shared password required to create a room (join only needs the code). */
export function expectedRoomPassword() {
  return process.env.ROOM_ACCESS_PASSWORD?.trim() || "Jesusrules1!";
}

export function roomPasswordOk(password: unknown): boolean {
  if (typeof password !== "string") return false;
  return password === expectedRoomPassword();
}
