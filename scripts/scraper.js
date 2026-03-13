#!/usr/bin/env node
/**
 * NPR New Music Friday Scraper
 *
 * Scrapes album lists from NPR's New Music Friday pages and outputs JSON.
 * Usage: node scripts/scraper.js [--url URL]
 *   - No URL: discovers latest from NPR Music RSS, then scrapes it
 *   - With --url: scrapes the given URL
 */

import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

function discoverLatestUrl() {
  const scriptPath = join(__dirname, "discover-npr-url.js");
  return execSync(`node "${scriptPath}"`, { encoding: "utf8" }).trim();
}

/**
 * Extract artist, album, and label from "Artist, Album (Label)" text.
 * Uses last comma before " (" to split artist from album (handles artists with commas).
 */
function parseAlbumEntry(text) {
  const trimmed = text.trim();
  const labelMatch = trimmed.match(/\s*\(([^)]+)\)\s*$/);
  if (!labelMatch) return null;

  const label = labelMatch[1].trim();
  const beforeLabel = trimmed.slice(0, labelMatch.index).trim();
  const lastCommaIdx = beforeLabel.lastIndexOf(",");
  if (lastCommaIdx === -1) return null;

  const artist = beforeLabel.slice(0, lastCommaIdx).trim();
  const album = beforeLabel.slice(lastCommaIdx + 1).trim();
  if (!artist || !album) return null;

  return { artist, album, label };
}

/**
 * Scrape albums from NPR New Music Friday page.
 */
async function scrape(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const html = await res.text();

  const $ = cheerio.load(html);
  const storyText = $("#storytext");
  if (!storyText.length) throw new Error("Could not find #storytext");

  const result = {
    source: url,
    scrapedAt: new Date().toISOString(),
    date: $('meta[name="date"]').attr("content") || null,
    title: $("h1").first().text().trim() || null,
    starting5: [],
    lightningRound: [],
    dorasCorner: [],
    longList: {},
  };

  // Helper: extract from p (Starting 5, Lightning Round, Dora's Corner).
  // Handles both formats: "<strong>Artist</strong>, <em>Album</em> (Label)" and "Artist, <em>Album</em> (Label)".
  const extractFromP = (pEl) => {
    const $p = $(pEl);
    const strong = $p.find("strong").first();
    const em = $p.find("em").first();
    if (strong.length && em.length) {
      const artist = strong.text().replace(/,\s*$/, "").trim();
      const album = em.text().trim();
      const labelMatch = $p.text().match(/\(([^)]+)\)/);
      const label = labelMatch ? labelMatch[1].trim() : null;
      if (artist && album) return { artist, album, label };
    }
    // No strong (e.g. March 2026 layout): parse plain text "Artist, Album (Label)"
    // Strip leading emoji/symbols and trailing " — Recommender"
    let raw = $p
      .text()
      .replace(/\s*—\s*[^—]+$/, "")
      .trim();
    raw = raw.replace(/^[\s\uD83C\uDFB5\u26A1\uD83C\uDFBF]+/g, "").trim();
    if (!raw) return null;
    const entry = parseAlbumEntry(raw);
    if (entry && entry.artist) {
      entry.artist = entry.artist.replace(/^[\s\p{So}\p{Sk}\p{C}]+/gu, "").trim();
    }
    return entry;
  };

  // Walk through #storytext children, track current section
  let currentSection = null;
  let currentGenre = null;

  storyText
    .find("h2.edTag, p, ul.edTag.rte2-style-ul")
    .each((_, el) => {
      const $el = $(el);
      const tagName = el.tagName?.toLowerCase();

      if (tagName === "h2") {
        const title = $el.text().trim();
        if (title === "The Starting 5") currentSection = "starting5";
        else if (title === "The Lightning Round") currentSection = "lightningRound";
        else if (title === "Dora's Corner") currentSection = "dorasCorner";
        else if (title === "The Long List") currentSection = "longList";
        else currentSection = null;
        currentGenre = null;
        return;
      }

      if (tagName === "p" && currentSection) {
        const text = $el.text();
        // Check if this is a genre header (Long List): strong only, no em, short text
        const isGenreHeader =
          currentSection === "longList" &&
          $el.find("strong").length &&
          !$el.find("em").length &&
          text.length < 50;
        if (isGenreHeader) {
          currentGenre = $el.find("strong").text().trim();
          if (currentGenre && !result.longList[currentGenre]) {
            result.longList[currentGenre] = [];
          }
          return;
        }
        // Album entry with emoji prefix
        if (/[🎵⚡💿]/.test(text)) {
          const entry = extractFromP(el);
          if (entry) {
            if (currentSection === "starting5") result.starting5.push(entry);
            else if (currentSection === "lightningRound") result.lightningRound.push(entry);
            else if (currentSection === "dorasCorner") result.dorasCorner.push(entry);
          }
        }
        return;
      }

      if (tagName === "ul" && currentSection === "longList" && currentGenre) {
        $el.find("li").each((_, li) => {
          const liText = $(li).text().trim();
          const entry = parseAlbumEntry(liText);
          if (entry) {
            result.longList[currentGenre].push(entry);
          }
        });
      }
    });

  return result;
}

/**
 * Flatten all albums into a single array for convenience.
 */
function flattenAlbums(data) {
  const all = [
    ...data.starting5.map((a) => ({ ...a, section: "starting5" })),
    ...data.lightningRound.map((a) => ({ ...a, section: "lightningRound" })),
    ...data.dorasCorner.map((a) => ({ ...a, section: "dorasCorner" })),
  ];
  return all;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const urlIndex = args.indexOf("--url");
  let url;
  if (urlIndex !== -1 && args[urlIndex + 1]) {
    url = args[urlIndex + 1];
  } else {
    console.log("Discovering latest NPR New Music Friday URL...");
    url = discoverLatestUrl();
  }
  console.log("Scraping:", url);
  const data = await scrape(url);
  const allAlbums = flattenAlbums(data);

  // Write outputs
  const dataDir = join(ROOT_DIR, "data");
  mkdirSync(dataDir, { recursive: true });

  const fullPath = join(dataDir, "albums.json");
  writeFileSync(
    fullPath,
    JSON.stringify(
      { ...data, allAlbums },
      null,
      2
    ),
    "utf8"
  );
  console.log(`Wrote ${fullPath}`);
  console.log(`  Starting 5: ${data.starting5.length}`);
  console.log(`  Lightning Round: ${data.lightningRound.length}`);
  console.log(`  Dora's Corner: ${data.dorasCorner.length}`);
  console.log(
    `  Long List: ${Object.values(data.longList).reduce((s, a) => s + a.length, 0)} albums`
  );
  console.log(`  Total featured (Starting 5 + Lightning Round + Dora's Corner): ${allAlbums.length} albums`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
