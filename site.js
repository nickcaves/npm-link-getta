const SECTIONS = {
  starting5: "The Starting 5",
  lightningRound: "The Lightning Round",
  dorasCorner: "Dora's Corner",
};

function buildWebSearchUrl(album) {
  const q = `${album.artist} ${album.album}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function getLink(album) {
  if (album.songlink?.pageUrl) return album.songlink.pageUrl;
  if (album.spotify?.url) return album.spotify.url;
  if (album.spotifySearchUrl) return buildWebSearchUrl(album);
  return null;
}

function getLinkLabel(album) {
  if (album.songlink?.pageUrl) return "Album link";
  if (album.spotify?.url) return "Open on Spotify";
  if (album.spotifySearchUrl) return "Search the web";
  return null;
}

function getImageUrl(album) {
  const img = album.spotify?.images?.[1] || album.spotify?.images?.[0];
  return img?.url || null;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function renderAlbum(album) {
  const link = getLink(album);
  const label = getLinkLabel(album);
  const imgUrl = getImageUrl(album);

  const art = imgUrl
    ? `<img class="card-art" src="${imgUrl}" alt="" loading="lazy">`
    : `<div class="card-art" aria-hidden="true"></div>`;

  const btn = link
    ? `<a href="${link}" target="_blank" rel="noopener" class="btn${label === "Search the web" ? " search" : ""}">${label}</a>`
    : "";

  return `
    <article class="card">
      ${art}
      <div class="card-info">
        <p class="card-artist">${escapeHtml(album.artist)}</p>
        <p class="card-album">${escapeHtml(album.album)}</p>
        ${album.label ? `<p class="card-label">${escapeHtml(album.label)}</p>` : ""}
      </div>
      <div class="card-actions">${btn}</div>
    </article>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function groupBySection(albums) {
  const groups = {};
  for (const album of albums) {
    const s = album.section || "other";
    if (!groups[s]) groups[s] = [];
    groups[s].push(album);
  }
  return groups;
}

async function main() {
  const loadingEl = document.getElementById("loading");
  const metaEl = document.getElementById("meta");
  const container = document.getElementById("albums");

  if (location.protocol === "file:") {
    container.innerHTML = `
      <p class="error">
        Open via <code>npm run site</code>, then visit <a href="http://localhost:3000">http://localhost:3000</a>.
        File links don't work when opening the HTML directly.
      </p>
    `;
    return;
  }

  try {
    let data = window.ALBUMS_DATA;
    if (!data) {
      const res = await fetch("/data/albums-with-links.json");
      if (!res.ok) throw new Error(`HTTP ${res.status} — check that data/albums-with-links.json exists`);
      data = await res.json();
    }

    metaEl.textContent = data.title
      ? `Albums from ${formatDate(data.date) || data.title}`
      : formatDate(data.date) || "";

    const grouped = groupBySection(data.albums || []);
    const order = ["starting5", "lightningRound", "dorasCorner"];

    let html = "";
    for (const sectionId of order) {
      const albums = grouped[sectionId];
      if (!albums?.length) continue;

      const title = SECTIONS[sectionId] || sectionId;
      const cards = albums.map(renderAlbum).join("");

      html += `
        <section class="section">
          <h2 class="section-title">${escapeHtml(title)}</h2>
          <div class="card-list">${cards}</div>
        </section>
      `;
    }

    container.innerHTML = html || '<p class="loading">No albums found.</p>';
  } catch (err) {
    container.innerHTML = `
      <p class="error">
        Failed to load albums: ${escapeHtml(err.message)}<br><br>
        Run <code>npm run scrape</code> and <code>npm run resolve</code>, then <code>npm run site</code>.
        Open <a href="http://localhost:3000">http://localhost:3000</a> (not the file directly).
      </p>
    `;
    console.error(err);
  }
}

main();
