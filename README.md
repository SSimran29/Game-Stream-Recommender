# Game + Stream Recommender 01/25/2025 - 05/20/2025 (College Project)

Stream Live Games is a full-stack web app that connects game discovery with live streaming. The user picks a genre, the app recommends a random game from the RAWG.io API, and then finds a live Twitch stream of that game through the Twitch API and embeds it on the page.

# How it works?
Pick a genre (or type your own) and get a random game from RAWG plus a live Twitch stream playing it. 

Frontend: HTML,CSS, JavaScript
Backend: Node.js APIs: RAWG.io API, Twitch API
Tools: VS Code, 

## Setup
1. `cp credentials.example.json credentials.json`
2. Fill in your RAWG API key and Twitch client ID/secret.
3. `npm start`, then open http://localhost:3000

## How it works

```mermaid
sequenceDiagram
    participant C as Client (browser)
    participant S as Server (Node)
    participant R as RAWG API
    participant A as Twitch auth (id.twitch.tv)
    participant T as Twitch API
    C->>S: 1. GET /
    S-->>C: 2. index.html
    C->>S: 3. GET /api/recommend?genre=action
    S->>R: 4. GET /games?key=...&genres=action&page_size=40
    R-->>S: 5. JSON list of games (server picks one at random)
    S->>A: 6. POST /oauth2/token (only if no cached token)
    A-->>S: 7. access token
    S->>T: 8. GET /helix/search/categories?query=GAME&first=10
    T-->>S: 9. JSON categories (exact name match only)
    S->>T: 10. GET /helix/streams?game_id=ID&first=1
    T-->>S: 11. JSON live stream
    S-->>C: 12. JSON with game and stream
```

The browser then builds the page and loads the Twitch player iframe from `player.twitch.tv`.
