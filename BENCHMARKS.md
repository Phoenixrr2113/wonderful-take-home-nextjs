# Benchmark Results

## Live API

**URL**: https://wonderful-take-home-nextjs.vercel.app
**Repo**: https://github.com/Phoenixrr2113/wonderful-take-home-nextjs
**Stack**: Next.js 16 (App Router) + TypeScript + kdbush/geokdbush + Vercel
**Dataset**: 8,107 airports loaded from static JSON, in-memory spatial index

## Architecture

- **No database** — airport data lives in a committed JSON file (~1.6MB)
- **No Redis** — geospatial queries handled by kdbush/geokdbush in-process
- **No Docker** — deployed to Vercel serverless with Fluid Compute
- **Static routes** — `/api/airports` (ISR, 1hr) and `/api/airports/[id]` (8,107 pages prerendered at build) served from edge CDN with zero function invocations
- **Dynamic routes** — search, distance, closest, route-find run as serverless functions

## Final Results (Vercel Production, Warm Instance)

All times are compute-only (`X-Response-Time` header), not including network latency.

| Endpoint | Method | Compute Time |
|---|---|---|
| `GET /api/airports` | ISR (edge CDN) | **0ms** (prerendered) |
| `GET /api/airports/[id]` | SSG (edge CDN) | **0ms** (prerendered) |
| `GET /api/airports/search?latitude=40.6413&longitude=-73.7781&radius=50` | geokdbush spatial query | **0.46ms** |
| `GET /api/airports/distance?airport1_id=2050&airport2_id=3797` | Haversine calculation | **0.22ms** |
| `GET /api/airports/closest?country1=United States&country2=Mexico` | Spatial nearest w/ predicate | **2.33ms** |
| `GET /api/airports/route-find?airport1_id=3797&airport2_id=3484` (JFK→LAX) | Bidirectional BFS | **1.12ms** |
| `GET /api/airports/route-find?airport1_id=2050&airport2_id=3797` (Kabul→JFK) | Bidirectional BFS | **4.94ms** |

## Optimization Progression

Three rounds of optimization were applied to the dynamic endpoints.

### v1 — Naive Implementation

Straight port of the Laravel logic: geokdbush radius query per BFS hop, `Set` for visited, `array.shift()` for queue, O(n*m) brute-force for closest.

| Endpoint | Local (warm) | Vercel (warm) |
|---|---|---|
| Search (50mi from JFK) | 0.14ms | 0.71ms |
| Distance (Kabul↔JFK) | 0.20ms | 0.64ms |
| Closest (US vs Mexico) | 6.42ms | 14-20ms |
| BFS JFK→LAX (7 stops) | 71.94ms | 173-230ms |

**Bottleneck**: BFS called `geokdbush.around()` at every hop (network-free but still expensive at scale), stored full path arrays in the queue (massive GC pressure), and `array.shift()` is O(n).

### v2 — A* Heuristic + Typed Arrays + Parent Map

- Replaced path-array BFS with parent-pointer reconstruction (`Int32Array`)
- Replaced `Set<number>` with `Uint8Array` for visited tracking
- Added A* heuristic: priority buckets sorted by `hops + ceil(remainingDistance / 500mi)`
- Added `airportIndexById` map to eliminate `findIndex()` linear scans

| Endpoint | Local (warm) | Vercel (warm) |
|---|---|---|
| Search | 0.14ms | 0.92ms |
| Distance | 0.20ms | 0.58ms |
| Closest (US vs Mexico) | 6.42ms | 26ms |
| BFS JFK→LAX | **2.24ms** | **4.3ms** |
| BFS Kabul→JFK | 74ms | 163ms |

**Result**: JFK→LAX **50x faster** on Vercel. Kabul→JFK still slow due to many intercontinental hops.

### v3 — Precomputed Graph + Bidirectional BFS + Spatial Closest

- **Precomputed neighbor graph**: at startup, build the full 500mi adjacency list for all 8,107 airports. BFS does zero spatial queries at runtime — just iterates pre-built arrays.
- **Bidirectional BFS**: search from both origin and destination simultaneously, expanding the smaller frontier first. Two small search spheres instead of one massive one.
- **Spatial predicate for closest**: instead of O(n*m) haversine comparisons, use `geokdbush.around()` with a country-filter predicate. O(n) spatial lookups instead of O(n*m) brute force.

| Endpoint | Local (warm) | Vercel (warm) |
|---|---|---|
| Search | 0.14ms | **0.46ms** |
| Distance | 0.20ms | **0.22ms** |
| Closest (US vs Mexico) | **0.86ms** | **2.33ms** |
| BFS JFK→LAX | **0.39ms** | **1.12ms** |
| BFS Kabul→JFK | **1.36ms** | **4.94ms** |

## Total Speedup (Vercel Warm, v1 → v3)

| Endpoint | v1 | v3 | Speedup |
|---|---|---|---|
| Closest (US vs Mexico) | 14-20ms | 2.33ms | **~8x** |
| BFS JFK→LAX | 173-230ms | 1.12ms | **~200x** |
| BFS Kabul→JFK | N/A (not tested) | 4.94ms | — |

## Cold Start Behavior

On first invocation after deploy (cold start), the serverless function must:
1. Load the 8,107-airport JSON (~1.6MB)
2. Build the kdbush spatial index (~5ms)
3. Build the precomputed neighbor graph (~200-400ms)

First-request times are higher but subsequent requests on the same warm instance are sub-5ms. With Vercel Fluid Compute, instances stay warm across requests, so cold starts are rare under sustained traffic.

| Endpoint | Cold Start | Warm |
|---|---|---|
| Search | 3.80ms | 0.46ms |
| Distance | 0.75ms | 0.22ms |
| Closest | 5.25ms | 2.33ms |
| BFS JFK→LAX | 3.64ms | 1.12ms |
| BFS Kabul→JFK | 20.40ms | 4.94ms |

## Comparison: Next.js (this project) vs Laravel (original)

The original implementation uses Laravel 13 + MySQL + Redis (GEORADIUS) + Docker.

| Dimension | Laravel + MySQL + Redis | Next.js + JSON + geokdbush |
|---|---|---|
| Infrastructure | Docker, MySQL, Redis, PHP | None (Vercel serverless) |
| External services | 2 (MySQL, Redis) | 0 |
| Deployment | Manual server setup | `git push` |
| Data store | MySQL + Redis GEOADD | Static JSON file |
| Spatial queries | Redis GEORADIUS (network hop) | In-memory kdbush (zero I/O) |
| BFS per hop | Redis round-trip (~1-5ms) | Array lookup (~0.001ms) |
| Static endpoints | Every request hits server | Edge CDN, zero compute |
| Monthly cost (500 req/s) | $7-50 (VPS) | $0-20 (Vercel free/pro) |
| Files of application code | ~15 | 7 |
| Setup time | ~2 hours | ~30 minutes |
