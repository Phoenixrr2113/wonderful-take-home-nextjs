# Design Decisions — Next.js Implementation

## Context: Why This Version Exists

I originally built this challenge in Laravel (PHP) with MySQL, Redis, and Docker. After completing that implementation, I stepped back and questioned whether the stack was the right fit for the actual requirements:

- The data is **static** — airports rarely change.
- The dataset is **small** — 8,107 airports, ~1.6MB as JSON.
- The API is **read-heavy** — 500 req/s average, no writes.

With a static dataset that fits in memory, I didn't need a relational database, a geospatial cache, or container orchestration. I rebuilt the API in Next.js to test that hypothesis, and the results confirmed it — sub-millisecond query times, zero infrastructure, and a `git push` deployment.

Both implementations solve the same 5 problems from the challenge. The Laravel version is the "traditional" approach. This one is the "right-sized" approach.

## Stack

- **Next.js 16 (App Router)**: TypeScript, file-based routing, built-in static generation. I use TypeScript day to day so this was faster for me to write than PHP.
- **kdbush + geokdbush**: In-memory spatial index for geospatial queries. Built by the creator of Leaflet/Mapbox. Indexes 8K airports in ~5ms, answers radius queries in microseconds.
- **Zod**: Runtime validation for query parameters. Similar to Laravel's form requests but with TypeScript type inference.
- **Vercel**: Serverless deployment with Fluid Compute. Static routes served from edge CDN. Dynamic routes run as serverless functions.
- **No database**: Airport data lives in a committed JSON file. No MySQL, no Postgres, no Redis.
- **No Docker**: Nothing to orchestrate when there are no external services.

## Problem 1 — Full Stack Description

### Hosting
Vercel with Fluid Compute. Static routes (list all airports, single airport by ID) are pre-rendered at build time and served from edge CDN globally — zero function invocations, zero compute cost. Dynamic routes (search, distance, closest, route) run as serverless functions that stay warm under sustained traffic.

### Language
TypeScript. Type safety across the entire codebase, from Zod validation schemas to API response types. No runtime type errors.

### Framework
Next.js 16 with the App Router. Route handlers are just exported functions in files — no separate route registration, no controller classes. A single file per endpoint.

### Storage
A static JSON file (`src/data/airports.json`, ~1.6MB) committed to the repository. Converted once from the provided CSV via a build script. Loaded into memory at module level and shared across all requests on a warm instance.

At module load, the data is indexed three ways:
- `airports[]` — full array for iteration
- `airportById: Map<number, Airport>` — O(1) ID lookup
- `airportsByCountry: Map<string, Airport[]>` — O(1) country lookup
- `KDBush` spatial index — O(log N) geographic queries

### Performance
This is where the architecture really pays off. Because everything is in-memory with zero network I/O:

| Endpoint | Vercel (warm) |
|---|---|
| List All Airports | **0ms** (edge CDN) |
| Single Airport | **0ms** (edge CDN, pre-rendered) |
| Search (50mi radius) | **0.46ms** |
| Distance | **0.22ms** |
| Closest (US vs Mexico) | **2.33ms** |
| BFS Route (JFK→LAX) | **1.12ms** |
| BFS Route (Kabul→JFK) | **4.94ms** |

Key optimizations that got us here:
- **Precomputed neighbor graph**: At startup, the 500-mile adjacency list for all 8,107 airports is built once. BFS pathfinding does zero spatial queries at runtime — just iterates pre-built arrays.
- **Bidirectional BFS**: Search from origin and destination simultaneously. The two frontiers meet in the middle, dramatically reducing the search space for long routes.
- **Spatial predicate for closest**: Instead of O(n*m) brute-force haversine comparisons, we use geokdbush's `around()` with a country-filter predicate — O(n) spatial lookups.

### Misc
- **Insomnia collection** included (`insomnia-collection.json`) with all endpoints, multiple test cases, and environment switching between local and Vercel.
- **X-Response-Time header** on all dynamic endpoints for benchmarking.
- **Static generation** for the two CRUD endpoints: `/api/airports` uses ISR (1hr revalidation), `/api/airports/[id]` uses `generateStaticParams()` to pre-render all 8,107 airport pages at build time.

### Scalability and Cost Estimates
- **Vercel Free tier** ($0/month): 100GB bandwidth, 100 hours compute. Handles moderate traffic easily since static routes cost nothing.
- **Vercel Pro** ($20/month): 1TB bandwidth, 1000 GB-hours compute. At 500 req/s with sub-5ms compute per request, this is well within limits.
- Scaling is automatic — Vercel adds instances as needed. No load balancer configuration, no server provisioning.
- The only scaling concern is cold starts: the precomputed neighbor graph takes ~200-400ms to build on first invocation. With Fluid Compute keeping instances warm, this is rare under sustained traffic.

## What I Learned From the Pivot

The Laravel version taught me that choosing a stack based on familiarity ("I know Laravel, it scaffolds fast") can lead to over-engineering when the problem is actually simple. The challenge requirements — static data, read-heavy, small dataset — pointed clearly toward an in-memory solution, but I didn't see that until after I'd already built the infrastructure-heavy version.

Specific takeaways:
1. **Read the requirements literally.** "Airports are not often added" means the data is effectively static. Static data doesn't need a database.
2. **Size the solution to the data.** 8,107 records at ~200 bytes each is 1.6MB. That fits in a single variable. No need for external storage or caching.
3. **Network I/O is the real bottleneck.** The Laravel version's BFS made a Redis round-trip per hop. The Next.js version does the same traversal in pre-built arrays — 200x faster.
4. **Less infrastructure = fewer failure modes.** The Laravel version had phpredis compatibility issues that broke the BFS endpoint entirely. The Next.js version has zero external dependencies at runtime.

## Correctness Verification

All endpoints were cross-validated against:
- The Laravel implementation (identical results on every test case)
- Known real-world aviation distances (JFK→LAX: 2,469mi vs published ~2,475mi — within 0.2%)
- Independent Python haversine calculation (0.00mi difference)

See `BENCHMARKS.md` for full benchmark data and the optimization progression.
