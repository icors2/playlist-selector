export type TrackResult = {
  id: string;
  name: string;
  artists: string;
  albumArt: string | null;
  previewUrl: string | null;
  durationMs: number;
  uri: string;
};

/** Curated tracks used when Spotify credentials are not configured. */
export const DEMO_TRACKS: TrackResult[] = [
  {
    id: "3n3Ppam7vgaVa1IA8jmWRj",
    name: "Mr. Brightside",
    artists: "The Killers",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273ccdddd46119a4ff53eaf1f5d",
    previewUrl: null,
    durationMs: 222200,
    uri: "spotify:track:3n3Ppam7vgaVa1IA8jmWRj",
  },
  {
    id: "0VjIjW4KwUZ0kK4BkvK5jV",
    name: "Blinding Lights",
    artists: "The Weeknd",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36",
    previewUrl: null,
    durationMs: 200040,
    uri: "spotify:track:0VjIjW4KwUZ0kK4BkvK5jV",
  },
  {
    id: "7qiZfU4dY1lWllzX7mPBI3",
    name: "Shape of You",
    artists: "Ed Sheeran",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96",
    previewUrl: null,
    durationMs: 233713,
    uri: "spotify:track:7qiZfU4dY1lWllzX7mPBI3",
  },
  {
    id: "1rqqCSm0Qe4I9rUvWncaom",
    name: "High Hopes",
    artists: "Panic! At The Disco",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273c5148520a59be191ee760f63",
    previewUrl: null,
    durationMs: 190947,
    uri: "spotify:track:1rqqCSm0Qe4I9rUvWncaom",
  },
  {
    id: "6habFhsOp2NvshLv26DqMb",
    name: "Despacito",
    artists: "Luis Fonsi, Daddy Yankee",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273ef24c3fdbf856340d55cfeb2",
    previewUrl: null,
    durationMs: 229360,
    uri: "spotify:track:6habFhsOp2NvshLv26DqMb",
  },
  {
    id: "0e7ipj03S05BNyluHms5jb",
    name: "rockstar",
    artists: "Post Malone, 21 Savage",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273b1c4b76b385040f242fd5834",
    previewUrl: null,
    durationMs: 218147,
    uri: "spotify:track:0e7ipj03S05BNyluHms5jb",
  },
  {
    id: "2Fxmhks0bxGSBdJ92vM42m",
    name: "bad guy",
    artists: "Billie Eilish",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b27350a3147b4edd7701a876c6ce",
    previewUrl: null,
    durationMs: 194088,
    uri: "spotify:track:2Fxmhks0bxGSBdJ92vM42m",
  },
  {
    id: "5QO79kh1paicVfzT5RJ1GW",
    name: "Save Your Tears",
    artists: "The Weeknd",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36",
    previewUrl: null,
    durationMs: 215627,
    uri: "spotify:track:5QO79kh1paicVfzT5RJ1GW",
  },
  {
    id: "4iJyoBOItJjl16f3YJz9Jc",
    name: "Levitating",
    artists: "Dua Lipa",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273d4daf28d55adff5937a95f28",
    previewUrl: null,
    durationMs: 203064,
    uri: "spotify:track:4iJyoBOItJjl16f3YJz9Jc",
  },
  {
    id: "3KkXRkHbMCARz0aVfEt68P",
    name: "Sunflower",
    artists: "Post Malone, Swae Lee",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273e2e352d89826aef6dbd5ff8f",
    previewUrl: null,
    durationMs: 158040,
    uri: "spotify:track:3KkXRkHbMCARz0aVfEt68P",
  },
  {
    id: "0pqnGHJpmpxLKifKRmU6WP",
    name: "Believer",
    artists: "Imagine Dragons",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b2735675e616f950e9b374f9cd1d",
    previewUrl: null,
    durationMs: 204347,
    uri: "spotify:track:0pqnGHJpmpxLKifKRmU6WP",
  },
  {
    id: "2xLMifQCjDGFmkHbpNLD9h",
    name: "SICKO MODE",
    artists: "Travis Scott",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273072e9faef2ef7b6db6389913",
    previewUrl: null,
    durationMs: 312820,
    uri: "spotify:track:2xLMifQCjDGFmkHbpNLD9h",
  },
  {
    id: "6DCZcSspjsKoFjzjrWowXc",
    name: "God's Plan",
    artists: "Drake",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273f175adb4c10e9cb2e5d4d8d5",
    previewUrl: null,
    durationMs: 198973,
    uri: "spotify:track:6DCZcSspjsKoFjzjrWowXc",
  },
  {
    id: "1zi7xx7UVEFkmKfv06H8x0",
    name: "One Dance",
    artists: "Drake, Wizkid, Kyla",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b2739416ed64daf84936d89e671c",
    previewUrl: null,
    durationMs: 173987,
    uri: "spotify:track:1zi7xx7UVEFkmKfv06H8x0",
  },
  {
    id: "7ytR5pREyojnnyYpKL4b0n",
    name: "Industry Baby",
    artists: "Lil Nas X, Jack Harlow",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273be82673b5f79d9658ec0a9fd",
    previewUrl: null,
    durationMs: 212353,
    uri: "spotify:track:7ytR5pREyojnnyYpKL4b0n",
  },
  {
    id: "4u7EnebtmKWzUH433cf5Qv",
    name: "Bohemian Rhapsody",
    artists: "Queen",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273ce4f1737bc8a646c8c4bd25b",
    previewUrl: null,
    durationMs: 354320,
    uri: "spotify:track:4u7EnebtmKWzUH433cf5Qv",
  },
  {
    id: "5ghIJDpPoe3G90WXd7OB9l",
    name: "Smells Like Teen Spirit",
    artists: "Nirvana",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273e175a0463ec1aad515099805",
    previewUrl: null,
    durationMs: 301920,
    uri: "spotify:track:5ghIJDpPoe3G90WXd7OB9l",
  },
  {
    id: "4VqPOruhp5EdPBeR92t6lQ",
    name: "Uptown Funk",
    artists: "Mark Ronson, Bruno Mars",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273e419ccba0baa8bd3f3d2ab25",
    previewUrl: null,
    durationMs: 269667,
    uri: "spotify:track:4VqPOruhp5EdPBeR92t6lQ",
  },
  {
    id: "1Tfq87rn573UAgQJXyiXBc",
    name: "Don't Stop Believin'",
    artists: "Journey",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273f3bd67035f08528d183e4518",
    previewUrl: null,
    durationMs: 250320,
    uri: "spotify:track:1Tfq87rn573UAgQJXyiXBc",
  },
  {
    id: "0DiWol3AO6WpXZgp0goxAV",
    name: "One More Time",
    artists: "Daft Punk",
    albumArt:
      "https://i.scdn.co/image/ab67616d0000b273b33d46dfa0d705a5c3c0b5e2",
    previewUrl: null,
    durationMs: 320357,
    uri: "spotify:track:0DiWol3AO6WpXZgp0goxAV",
  },
];

export function searchDemoTracks(query: string): TrackResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return DEMO_TRACKS.slice(0, 12);
  return DEMO_TRACKS.filter(
    (t) =>
      t.name.toLowerCase().includes(q) || t.artists.toLowerCase().includes(q),
  ).slice(0, 12);
}
