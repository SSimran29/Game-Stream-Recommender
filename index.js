// Game + Stream Recommender — Node 18+ (uses built-in fetch, zero dependencies)
const http = require("http");
const fs = require("fs");
const path = require("path");

// Keys come from environment variables (used on hosts like Render) or, locally, from credentials.json
let fileCreds = {};
try { fileCreds = require("./credentials.json"); } catch {}
const creds = {
  rawg_api_key: process.env.RAWG_API_KEY || fileCreds.rawg_api_key,
  twitch_client_id: process.env.TWITCH_CLIENT_ID || fileCreds.twitch_client_id,
  twitch_client_secret: process.env.TWITCH_CLIENT_SECRET || fileCreds.twitch_client_secret,
};

// Fail early with a clear message if a credential is missing or still a placeholder
for (const k of ["rawg_api_key", "twitch_client_id", "twitch_client_secret"]) {
  if (!creds[k] || /paste/i.test(creds[k])) throw new Error(`Set "${k}" in credentials.json or as an environment variable`);
}

const PORT = process.env.PORT || 3000;
const RAWG = "https://api.rawg.io/api";
const TWITCH = "https://api.twitch.tv/helix";

// ---------- helpers ----------
async function getJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200); // API's own explanation, e.g. "Invalid API key"
    throw new Error(`${new URL(url).hostname} responded with ${res.status}: ${detail}`);
  }
  return res.json();
}

const rawg = (endpoint, params = {}) =>
  getJSON(`${RAWG}/${endpoint}?${new URLSearchParams({ key: creds.rawg_api_key, ...params })}`);

// Twitch app token (client-credentials flow), cached until shortly before it expires
let token = { value: null, expiresAt: 0 };
async function twitch(endpoint, params) {
  if (Date.now() >= token.expiresAt) {
    const data = await getJSON("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: creds.twitch_client_id,
        client_secret: creds.twitch_client_secret,
        grant_type: "client_credentials",
      }),
    });
    token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  }
  return getJSON(`${TWITCH}/${endpoint}?${new URLSearchParams(params)}`, {
    headers: { "Client-Id": creds.twitch_client_id, Authorization: `Bearer ${token.value}` },
  });
}

// ---------- core logic ----------
let genreCache;
async function getGenres() {
  genreCache ??= (await rawg("genres")).results.map(({ name, slug }) => ({ name, slug }));
  return genreCache;
}

// genre: a RAWG genre slug picked from the dropdown. other: free text typed by the user.
async function recommend(genre, other) {
  const params = { page_size: 40 };

  if (!other) {
    params.genres = genre;
  } else {
    // 1) typed text that matches a real RAWG genre is treated as that genre
    const match = (await getGenres()).find(
      (g) => g.name.toLowerCase() === other.toLowerCase() || g.slug === other.toLowerCase()
    );
    if (match) {
      params.genres = match.slug;
    } else {
      // 2) otherwise it must exist on Twitch (as a category), or we report it as missing
      const { data } = await twitch("search/categories", { query: other, first: 1 });
      if (!data.length) return { missing: other };
      params.search = other;
    }
  }

  const { results } = await rawg("games", params);
  if (!results.length) return { game: null };

  const g = results[Math.floor(Math.random() * results.length)];
  const game = { name: g.name, image: g.background_image, rating: g.rating, released: g.released };

  // Twitch calls games "categories"; only accept an exact name match so we never show the wrong game
  const { data: categories } = await twitch("search/categories", { query: g.name, first: 10 });
  const category = categories.find((c) => c.name.toLowerCase() === g.name.toLowerCase());
  if (!category) return { game, stream: null };

  const { data: [stream = null] } = await twitch("streams", { game_id: category.id, first: 1 });
  return { game, stream };
}

// ---------- server ----------
http
  .createServer(async (req, res) => {
    const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const send = (status, body, type = "application/json") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(type === "application/json" ? JSON.stringify(body) : body);
    };

    try {
      if (pathname === "/") return send(200, fs.readFileSync(path.join(__dirname, "index.html")), "text/html");
      if (pathname === "/api/genres") return send(200, await getGenres());
      if (pathname === "/api/recommend") {
        const genre = searchParams.get("genre");
        const other = (searchParams.get("other") || "").trim();
        if (!genre && !other) return send(400, { error: "Pick a genre or type your own." });
        return send(200, await recommend(genre, other));
      }
      send(404, { error: "Not found" });
    } catch (err) {
      console.error(err);
      send(500, { error: err.message });
    }
  })
  .listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));