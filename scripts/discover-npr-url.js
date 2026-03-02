#!/usr/bin/env node
/**
 * Discovers the URL of the most recent NPR New Music Friday article from the
 * NPR Music podcast RSS feed. Prints the URL to stdout (and nothing else).
 *
 * Usage: node scripts/discover-npr-url.js
 */

import fetch from "node-fetch";

const RSS_URL = "https://feeds.npr.org/510019/podcast.xml";

// Match NPR article URLs that look like New Music Friday album list pages:
// https://www.npr.org/YYYY/MM/DD/nx-s1-XXXXX/new-music-friday-...
// Stop at < so we don't capture trailing </link> or similar.
const NEW_MUSIC_FRIDAY_URL_RE =
  /https:\/\/www\.npr\.org\/\d{4}\/\d{2}\/\d{2}\/[^"\s<>]+new-music-friday[^"\s<>]*/i;

async function main() {
  const res = await fetch(RSS_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NPR-New-Music-Friday-Scraper/1.0)",
    },
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();

  const match = xml.match(NEW_MUSIC_FRIDAY_URL_RE);
  if (!match) {
    const idx = xml.indexOf("new-music-friday");
    const snippet = idx >= 0 ? xml.slice(Math.max(0, idx - 80), idx + 80) : "(not found)";
    throw new Error(
      "No New Music Friday URL found in NPR Music podcast feed. Snippet: " + snippet
    );
  }

  const url = match[0].replace(/&amp;/g, "&").trim();
  process.stdout.write(url + "\n");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
