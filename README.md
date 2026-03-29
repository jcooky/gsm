# GSM — Global Shared Memory

> Your AI remembers the same things, everywhere.

GSM is a cloud-hosted **Remote MCP server** that gives AI assistants a persistent, shared knowledge graph. Whether you're using Cursor on your laptop, Claude Code on a remote server, or any other MCP-compatible client — your AI carries the same memory everywhere.

No more re-introducing yourself every session. No more "as I mentioned before." Just connect once with GitHub and your AI is up to speed.

---

## What is it?

GSM is a cloud replacement for the [local MCP Memory Server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory). It exposes the identical 9 tools over [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25) — fully compatible with any MCP client — backed by a cloud database instead of a local `.jsonl` file.

```
Local memory server          GSM
──────────────────           ────────────────────────────────────────
stdio transport         →    Streamable HTTP (accessible from anywhere)
memory.jsonl file       →    PostgreSQL (durable, concurrent-safe)
single machine          →    all your devices, all your IDEs
manual API key setup    →    GitHub login via MCP OAuth standard
```

## Quick Start

### Cursor

Add to your `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gsm": {
      "url": "https://gsm-mu.vercel.app/mcp"
    }
  }
}
```

### Claude Code

```bash
claude mcp add gsm --transport http https://gsm-mu.vercel.app/mcp
```

That's it. On first use, your client opens a browser for GitHub login — authentication is automatic from then on.

---

## System Prompt

For your AI to actively use the memory tools, add this to your **Cursor Rules** or **Claude Project Instructions**:

```
Follow these steps for each interaction:

1. Memory Retrieval:
   - Always begin by saying "Remembering..." and call read_graph or search_nodes
     to retrieve relevant information about the user and context.

2. Active Listening:
   - While conversing, watch for new information in these categories:
     a) Basic Identity (name, location, job, education, etc.)
     b) Behaviors (interests, habits, preferences)
     c) Goals (current projects, targets, aspirations)
     d) Relationships (people, organizations, tools the user works with)

3. Memory Update:
   - When new information is gathered, update the graph:
     a) create_entities for new people, projects, organizations, or concepts
     b) create_relations to connect them
     c) add_observations to record specific facts
   - Keep observations atomic — one fact per observation.

4. Memory Hygiene:
   - Use delete_observations to correct outdated facts.
   - Use delete_entities when something is no longer relevant.
```

**Cursor Rules** (`~/.cursor/rules/memory.mdc`):

```markdown
---
description: Use GSM memory tools to remember context across sessions
globs:
alwaysApply: true
---

[paste the prompt above]
```

**Claude Projects**: paste into the "Project Instructions" field.

---

## Features

### 9 Knowledge Graph Tools (drop-in compatible)

| Tool | Description |
|------|-------------|
| `create_entities` | Add people, projects, concepts to your AI's memory |
| `create_relations` | Define how things relate to each other |
| `add_observations` | Record facts about existing entities |
| `delete_entities` | Remove entities (cascades relations) |
| `delete_observations` | Remove specific facts |
| `delete_relations` | Remove specific relationships |
| `read_graph` | Read the full knowledge graph |
| `search_nodes` | Full-text search across names, types, and observations |
| `open_nodes` | Look up specific entities by name |

### Full-Text Search

`search_nodes` uses PostgreSQL's built-in full-text search (`websearch_to_tsquery`) with GIN indexes — not a slow in-memory filter. Supports natural language queries:

```
"machine learning"   → exact phrase
python OR typescript → either term
coding -java         → exclude a term
```

### Privacy & Isolation

Each GitHub account gets a completely isolated knowledge graph. Row Level Security (RLS) is enforced at the database level — your memories are never accessible to other users.

### Migrate from local memory server

Already using the local MCP memory server? Import your existing `memory.json` or `memory.jsonl` at [gsm-mu.vercel.app/migrate](https://gsm-mu.vercel.app/migrate). Format is auto-detected, import is idempotent, and you can export back any time.

---

## Architecture

```
Cursor / Claude Code / any MCP client
         │
         │  MCP Streamable HTTP (OAuth 2.1 + PKCE)
         ▼
   gsm-mu.vercel.app                    ← Next.js on Vercel
   ├── /mcp                             ← MCP endpoint
   ├── /.well-known/oauth-protected-resource   ← OAuth discovery (RFC 9728)
   ├── /oauth/consent                   ← GitHub login consent screen
   └── /migrate                         ← Import / export UI
         │
         │  Supabase JS (RLS-scoped queries)
         ▼
   Supabase
   ├── PostgreSQL                       ← entities, relations, observations
   │   └── Row Level Security           ← namespace isolation per user
   ├── Auth (OAuth 2.1 Server)         ← GitHub OAuth, DCR, JWT issuance
   └── Edge Functions                   ← health check
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| MCP Endpoint | Next.js API Route on Vercel |
| MCP Transport | `WebStandardStreamableHTTPServerTransport` (MCP SDK v1.28) |
| Website | Next.js 16 + Tailwind CSS |
| Database | Supabase PostgreSQL 17 + RLS |
| Auth | Supabase Auth (OAuth 2.1 + GitHub + Dynamic Client Registration) |
| Search | PostgreSQL Full-Text Search (`tsvector` + GIN index) |
| Tests | Vitest (integration + E2E, 26 tests) |

---

## Local Development

### Prerequisites

- Node.js 24 (`nvm use`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker
- A [GitHub OAuth App](https://github.com/settings/developers) — callback URL: `http://localhost:54321/auth/v1/callback`

### Setup

```bash
git clone https://github.com/jcooky/gsm
cd gsm
nvm use

# Install dependencies
npm install

# Configure GitHub OAuth credentials
cp .env.local.example .env.local
# Fill in SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID and _SECRET

# Start Supabase (DB + Auth + Edge Functions runtime)
export $(grep -v '^#' .env.local | xargs) && supabase start

# Serve Edge Functions
supabase functions serve

# Start Next.js dev server
npm run dev
```

| Service | URL |
|---------|-----|
| MCP endpoint (Edge Function) | `http://localhost:54321/functions/v1/mcp` |
| MCP endpoint (Next.js) | `http://localhost:3000/mcp` |
| Website | `http://localhost:3000` |
| Supabase Studio | `http://localhost:54323` |

### Running Tests

```bash
# All tests (integration + E2E)
npm test

# Integration only (graph-manager + RLS, no HTTP)
npm run test:integration

# E2E only (full MCP protocol over HTTP)
npm run test:e2e

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

Tests require `supabase start` and `supabase functions serve` to be running locally.

---

## Self-Hosting

### 1. Create a Supabase project

[supabase.com/dashboard](https://supabase.com/dashboard) → New project

Enable in the Supabase Dashboard:
- **Authentication → OAuth Server**: enable + allow Dynamic Client Registration
- **Authentication → Sign In / Providers**: add GitHub with your OAuth App credentials
- **Authentication → URL Configuration**: set Site URL to your Vercel deployment URL

### 2. Deploy to Vercel

```bash
# Link and deploy
vercel link
vercel --prod
```

### 3. Apply DB migrations

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 4. Deploy Edge Functions

```bash
supabase functions deploy health --no-verify-jwt
```

### 5. Update your MCP client config

```json
{
  "mcpServers": {
    "gsm": {
      "url": "https://your-vercel-url.vercel.app/mcp"
    }
  }
}
```

---

## Project Structure

```
gsm/
├── app/
│   ├── mcp/route.ts                    # MCP Streamable HTTP endpoint
│   ├── mcp/.well-known/...             # OAuth Protected Resource Metadata
│   ├── .well-known/oauth-protected-resource/  # Domain-root PRM
│   ├── oauth/consent/                  # OAuth consent screen
│   ├── migrate/                        # Import / export UI
│   ├── login/                          # GitHub login page
│   └── auth/callback/                  # OAuth callback handler
├── lib/
│   ├── graph-manager.ts                # All knowledge graph DB operations
│   ├── mcp-server.ts                   # MCP server with 9 tools
│   ├── auth.ts                         # JWT validation
│   ├── migration.ts                    # JSON/JSONL parser + validator
│   ├── oauth-metadata.ts               # OAuth discovery helpers
│   └── types.ts                        # Entity, Relation, KnowledgeGraph
├── tests/
│   ├── integration/graph-manager.test.ts
│   └── e2e/mcp-protocol.test.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20250329000000_initial_schema.sql
│   │   └── 20250330000000_fts_search.sql
│   └── functions/
│       ├── mcp/                        # Edge Function MCP server (Deno)
│       └── health/                     # Health check
└── docs/
    └── req_analysis.md
```

---

## License

MIT
