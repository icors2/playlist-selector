import { customAlphabet } from "nanoid";

const roomCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const token = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  32,
);

export function createRoomCode() {
  return roomCode();
}

export function createToken() {
  return token();
}
