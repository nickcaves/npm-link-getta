#!/usr/bin/env node
/**
 * Resolve streaming links for featured albums (Starting 5, Lightning Round, Dora's Corner).
 *
 * For each album in data/albums.json:
 *   1. Search Spotify for the album.
 *   2. Use the Spotify album URL with Songlink/Odesli to get a universal link + per-service links.
 *
 * Usage:
 *   SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/resolve-links.js
 *   or via npm:
 *   SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... npm run resolve
 */

import "dotenv/config";
import fetch from "node-fetch";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const DATA_PATH = join(ROOT_DIR, "data", "albums.json");
const OUTPUT_PATH = join(ROOT_DIR, "data", "albums-with-links.json");

const {
  SPOTIFY_CLIENT_ID: clientId,
  SPOTIFY_CLIENT_SECRET: clientSecret,
} = process.env;

if (!clientId || !clientSecret) {
  console.error(
    "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET.\n" +
      "Create a Spotify app at https://developer.spotify.com/dashboard,\n" +
      "then put the values in a .env file:\n\n" +
      "  SPOTIFY_CLIENT_ID=your_client_id\n" +
      "  SPOTIFY_CLIENT_SECRET=your_client_secret\n"
  );
  process.exit(1);
}

async function getSpotifyToken() {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function searchSpotifyAlbum(token, { artist, album }) {
  const q = encodeURIComponent(`album:${album} artist:${artist}`);
  const url = `https://api.spotify.com/v1/search?q=${q}&type=album&limit=3`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify search error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const albums = data.albums?.items || [];
  if (!albums.length) return null;

  const best = albums[0];
  return {
    id: best.id,
    name: best.name,
    url: best.external_urls?.spotify,
    release_date: best.release_date,
    images: best.images || [],
    artists: best.artists?.map((a) => ({ id: a.id, name: a.name })) || [],
  };
}

async function getSonglinkForUrl(sourceUrl) {
  if (!sourceUrl) return null;

  const apiUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(
    sourceUrl
  )}`;

  const res = await fetch(apiUrl);
  if (!res.ok) {
    const text = await res.text();
    console.warn(
      `Songlink error for ${sourceUrl}: ${res.status} ${text.slice(0, 120)}`
    );
    return null;
  }

  const data = await res.json();
  const byPlatform = data.linksByPlatform || {};

  const pickUrl = (platform) => byPlatform[platform]?.url || null;

  return {
    pageUrl: data.pageUrl || null, // universal smart link
    entitiesByUniqueId: data.entitiesByUniqueId || undefined,
    platforms: {
      spotify: pickUrl("spotify"),
      appleMusic: pickUrl("appleMusic"),
      deezer: pickUrl("deezer"),
      tidal: pickUrl("tidal"),
      youtube: pickUrl("youtube"),
      youtubeMusic: pickUrl("youtubeMusic"),
      soundcloud: pickUrl("soundcloud"),
      amazonMusic: pickUrl("amazonMusic"),
    },
  };
}

function loadAlbums() {
  const raw = readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw);
  const all = data.allAlbums || [];
  return { meta: data, albums: all };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Build a Spotify search URL for artist + album (fallback when Songlink unavailable) */
function buildSpotifySearchUrl({ artist, album }) {
  const query = `${artist} ${album}`.trim();
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

async function main() {
  console.log("Loading albums from", DATA_PATH);
  const { meta, albums } = loadAlbums();
  console.log(`Found ${albums.length} featured albums to resolve.`);

  console.log("Getting Spotify access token...");
  const token = await getSpotifyToken();
  console.log("Got Spotify token.");

  const resolved = [];

  for (let i = 0; i < albums.length; i++) {
    const album = albums[i];
    const label = album.label ? ` (${album.label})` : "";
    console.log(
      `[${i + 1}/${albums.length}] ${album.artist} – ${album.album}${label}`
    );

    try {
      const spotify = await searchSpotifyAlbum(token, album);
      if (!spotify) {
        console.warn("  → No Spotify match found");
        resolved.push({
          ...album,
          spotify: null,
          songlink: null,
          spotifySearchUrl: buildSpotifySearchUrl(album),
        });
        continue;
      }

      console.log(`  → Spotify: ${spotify.url}`);

      // Be nice to Songlink – small delay between calls.
      await sleep(800);
      const songlink = await getSonglinkForUrl(spotify.url);
      if (!songlink) {
        console.warn("  → Songlink not available");
      } else {
        console.log(`  → Songlink: ${songlink.pageUrl}`);
      }

      resolved.push({
        ...album,
        spotify,
        songlink,
        spotifySearchUrl: songlink?.pageUrl ? null : buildSpotifySearchUrl(album),
      });
    } catch (err) {
      console.warn("  → Error resolving album:", err.message);
      resolved.push({
        ...album,
        error: err.message,
        spotify: null,
        songlink: null,
        spotifySearchUrl: buildSpotifySearchUrl(album),
      });
    }
  }

  mkdirSync(join(ROOT_DIR, "data"), { recursive: true });

  const output = {
    source: meta.source,
    scrapedAt: meta.scrapedAt,
    date: meta.date,
    title: meta.title,
    total: resolved.length,
    albums: resolved,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");
  console.log("Wrote", OUTPUT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

