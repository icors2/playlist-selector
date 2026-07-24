import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getSpotifyAuthUrl,
  publicAppBase,
  SPOTIFY_REDIRECT_COOKIE,
  SPOTIFY_STATE_COOKIE,
  spotifyConfigured,
  spotifyRedirectUri,
} from "@/lib/spotify";

function clearLaunchCookies(response: NextResponse) {
  for (const name of [SPOTIFY_STATE_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 0,
    });
  }
}

/**
 * Same-origin hop after POST /api/spotify/export.
 * Browser navigates here, then we 302 to Spotify — more reliable on mobile
 * than assigning an external URL after an async fetch.
 */
export async function GET(request: Request) {
  const appBase = publicAppBase(request);

  if (!spotifyConfigured()) {
    return NextResponse.redirect(`${appBase}/?spotify=error`);
  }

  const cookieStore = await cookies();
  const state = cookieStore.get(SPOTIFY_STATE_COOKIE)?.value;
  const redirect =
    cookieStore.get(SPOTIFY_REDIRECT_COOKIE)?.value ||
    spotifyRedirectUri(request);

  if (!state) {
    const response = NextResponse.redirect(`${appBase}/?spotify=error`);
    clearLaunchCookies(response);
    return response;
  }

  const authorizeUrl = getSpotifyAuthUrl(state, redirect);
  console.info("Spotify OAuth authorize hop", { redirectUri: redirect });

  const response = NextResponse.redirect(authorizeUrl);
  clearLaunchCookies(response);
  // Keep SPOTIFY_REDIRECT_COOKIE for the callback token exchange.
  return response;
}
