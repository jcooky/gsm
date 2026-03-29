# GSM (Global Shared Memory) - Requirements Analysis

## 1. Project Overview

GSM is a cloud-hosted Remote MCP server that provides a **globally shared knowledge graph memory** for AI assistants. It is a cloud-native evolution of the [MCP Memory Server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory), enabling AI to retain and share context across any environment — Cursor, Claude Desktop, VS Code, Claude Code, or any MCP-compatible client.

### 1.1 Problem Statement

The current MCP memory server has fundamental limitations:

- **Local-only**: Data stored as a JSONL file on disk, accessible only from the machine it runs on
- **Single-process**: Uses stdio transport, only one client can connect at a time
- **No durability guarantees**: File-based storage with no transaction safety
- **No sharing**: Memory cannot be shared across machines, IDEs, or devices

### 1.2 Solution

GSM solves these by providing:

- **Remote access** via MCP Streamable HTTP transport on Supabase Edge Functions
- **Persistent cloud storage** via Supabase PostgreSQL with Row Level Security
- **GitHub login** via Supabase Auth (OAuth 2.1 Server) — MCP standard auth flow
- **Multi-tenant isolation** — each user gets an isolated knowledge graph namespace via RLS
- **Migration path** — import existing `memory.json` / `memory.jsonl` to seamlessly transition

### 1.3 Key Value Proposition

> One memory, everywhere. Whether you're on your MacBook with Cursor, your desktop with VS Code, or using Claude Code in a remote server — your AI remembers the same things. Just login with GitHub.

---

## 2. Architecture

### 2.1 High-Level Overview

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Cursor (Mac) │  │ Claude Code  │  │ VS Code (PC) │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       │    MCP Streamable HTTP + OAuth    │
       └─────────┬───────┴─────────┬───────┘
                 │                 │
       ┌─────────▼─────────────────▼─────────┐
       │          Supabase                    │
       │  ┌────────────────────────────────┐  │
       │  │  Edge Functions (Deno 2)       │  │
       │  │  POST /functions/v1/mcp        │  │
       │  │  ┌──────────────────────────┐  │  │
       │  │  │ MCP Server               │  │  │
       │  │  │ (9 Knowledge Graph Tools) │  │  │
       │  │  └──────────────────────────┘  │  │
       │  └──────────────┬─────────────────┘  │
       │  ┌──────────────▼─────────────────┐  │
       │  │  PostgreSQL + RLS              │  │
       │  │  (namespaces, entities,        │  │
       │  │   relations, observations)     │  │
       │  └────────────────────────────────┘  │
       │  ┌────────────────────────────────┐  │
       │  │  Auth (OAuth 2.1 Server)       │  │
       │  │  - GitHub social login         │  │
       │  │  - Dynamic Client Registration │  │
       │  │  - JWT issuance + validation   │  │
       │  │  - PKCE, JWKS, OIDC discovery  │  │
       │  └────────────────────────────────┘  │
       └─────────────────────────────────────┘

       ┌─────────────────────────────────────┐
       │          Vercel (Next.js)            │
       │  - Landing page                     │
       │  - OAuth consent screen             │
       │  - Migration UI (upload/export)     │
       │  - User dashboard                   │
       └─────────────────────────────────────┘
```

### 2.2 Component Responsibilities

| Component | Platform | Responsibilities |
|-----------|----------|-----------------|
| MCP Server | Supabase Edge Functions | 9 knowledge graph tools, JWT validation, stateless Streamable HTTP |
| Database | Supabase PostgreSQL | Knowledge graph storage, RLS-based namespace isolation |
| Auth | Supabase Auth | OAuth 2.1 Server, GitHub login, DCR, JWT issuance, token refresh |
| Website | Vercel (Next.js) | Landing page, OAuth consent screen, migration UI, dashboard |

### 2.3 Authentication Flow

Supabase Auth acts as the **OAuth 2.1 Authorization Server** per the [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization). MCP clients (Cursor, Claude Code) interact with it natively.

```
  Cursor / Claude Code              Supabase Auth              Supabase Edge Fn       Vercel (Next.js)
  ─────────────────────             ──────────────             ────────────────       ────────────────
         │                               │                          │                      │
    ①    │── POST /functions/v1/mcp ────────────────────────────►  │                      │
         │◄─ 401 + WWW-Authenticate ─────────────────────────────  │                      │
         │                               │                          │                      │
    ②    │── GET /.well-known/           │                          │                      │
         │   oauth-authorization-server ►│                          │                      │
         │◄─ AS metadata (endpoints) ────│                          │                      │
         │                               │                          │                      │
    ③    │── POST /auth/v1/oauth/        │                          │                      │
         │   register (DCR) ────────────►│                          │                      │
         │◄─ client_id ─────────────────│                          │                      │
         │                               │                          │                      │
    ④    │── GET /auth/v1/oauth/         │                          │                      │
         │   authorize (PKCE) ──────────►│                          │                      │
         │                               │── redirect to consent ──────────────────────►  │
         │                               │                          │                      │
    ⑤    │                               │              User lands on consent page ◄──────│
         │                               │              (GitHub login if needed)           │
         │                               │              User approves ─────────────────► │
         │                               │                          │                      │
    ⑥    │                               │◄─ approveAuthorization ──────────────────────  │
         │◄─ auth code redirect ─────────│                          │                      │
         │                               │                          │                      │
    ⑦    │── POST /auth/v1/oauth/token ─►│                          │                      │
         │◄─ JWT access token ───────────│                          │                      │
         │                               │                          │                      │
    ⑧    │── POST /functions/v1/mcp ────────────────────────────►  │                      │
         │   Authorization: Bearer <JWT>  │                    ✓ validate JWT              │
         │◄─ MCP tool response ──────────────────────────────────  │                      │
         │                               │               namespace = user_id              │
```

**Key Supabase Auth endpoints:**

| Endpoint | URL |
|----------|-----|
| Discovery | `https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1` |
| Authorization | `https://<ref>.supabase.co/auth/v1/oauth/authorize` |
| Token | `https://<ref>.supabase.co/auth/v1/oauth/token` |
| JWKS | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| OIDC Discovery | `https://<ref>.supabase.co/auth/v1/.well-known/openid-configuration` |

All of these are **provided by Supabase** — we don't implement any of them.

---

## 3. User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | MCP memory user | connect to GSM as a remote MCP server | my AI has persistent memory across all my devices |
| US-02 | MCP memory user | login with my GitHub account | I don't need to manage API keys manually |
| US-03 | MCP memory user | upload my existing `memory.json` or `memory.jsonl` | I can migrate without losing any knowledge |
| US-04 | MCP memory user | export my graph back to JSONL | I can backup or migrate away at any time |
| US-05 | AI assistant | call the same tools as the local memory server | switching to GSM requires zero prompt changes |
| US-06 | user | trust that my data is safe | concurrent access from multiple clients doesn't corrupt data |
| US-07 | Cursor user | just add a URL to my MCP config | OAuth login happens automatically via browser |
| US-08 | Claude Code user | add the server URL and authenticate in browser | I get the same memory as my other environments |
| US-09 | user | see my graph stats on a web dashboard | I know how much memory my AI has accumulated |

---

## 4. Functional Requirements

### 4.1 Core MCP Tools

GSM must implement all 9 tools from the original memory server with **identical input/output schemas**. This ensures drop-in compatibility — clients only need to change their MCP transport config.

| Tool | Description | Input |
|------|------------|-------|
| `create_entities` | Create new entities in the knowledge graph | `entities: Entity[]` |
| `create_relations` | Create directed relations between entities | `relations: Relation[]` |
| `add_observations` | Add observations to existing entities | `observations: {entityName, contents}[]` |
| `delete_entities` | Delete entities and cascade-delete their relations | `entityNames: string[]` |
| `delete_observations` | Remove specific observations from entities | `deletions: {entityName, observations}[]` |
| `delete_relations` | Remove specific relations | `relations: Relation[]` |
| `read_graph` | Return the entire knowledge graph | (none) |
| `search_nodes` | Search entities by name, type, or observation content | `query: string` |
| `open_nodes` | Retrieve specific entities by name | `names: string[]` |

**Compatibility constraint**: The response format must match the original server exactly so that existing system prompts and AI workflows continue to work without modification.

### 4.2 Authentication

Supabase Auth handles all authentication. GSM does **not** implement its own OAuth server.

| ID | Requirement |
|----|------------|
| AUTH-01 | Enable Supabase OAuth 2.1 Server with Dynamic Client Registration |
| AUTH-02 | Configure GitHub as social login provider in Supabase Auth |
| AUTH-03 | Build OAuth consent screen on Vercel (Next.js) using `supabase.auth.oauth.*` methods |
| AUTH-04 | Edge Function validates Supabase JWT on every MCP request |
| AUTH-05 | Extract `user_id` from JWT `sub` claim as namespace identifier |
| AUTH-06 | Auto-create namespace row on first authenticated request |
| AUTH-07 | Return `401 Unauthorized` with proper `WWW-Authenticate` header for unauthenticated requests |
| AUTH-08 | RLS policies enforce namespace isolation at database level |

### 4.3 Migration & Data Portability

| ID | Requirement |
|----|------------|
| MIG-01 | Import `memory.jsonl` (current format) — line-delimited JSON with `type: "entity"` or `type: "relation"` |
| MIG-02 | Import `memory.json` (legacy format) — single JSON object with `entities[]` and `relations[]` |
| MIG-03 | Auto-detect format (JSON vs JSONL) during import |
| MIG-04 | Validate imported data: reject malformed entities/relations with clear error messages |
| MIG-05 | Import is idempotent: re-importing the same file does not create duplicates |
| MIG-06 | Export full graph as JSONL (compatible with original memory server format) |
| MIG-07 | Export full graph as JSON (single object format) |
| MIG-08 | Migration handled entirely via website (Vercel Next.js) — no separate Edge Function |

### 4.4 Website Handles Migration

Migration (import/export) runs on the **Vercel website**, not as Edge Functions. The Next.js app uses the Supabase client directly to read/write the database on behalf of the authenticated user. This keeps Edge Functions focused purely on MCP, and gives users a rich UI for migration:

- File upload with drag & drop
- Auto-format detection (JSON vs JSONL)
- Data preview before import (entity/relation counts, sample data)
- Progress feedback during import
- Export download as JSONL or JSON

### 4.5 Supplementary Edge Functions

Lightweight endpoints for non-MCP operational needs.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/functions/v1/health` | Health check (DB connectivity) | None |

### 4.5 MCP Transport

| ID | Requirement |
|----|------------|
| TR-01 | MCP Streamable HTTP via `WebStandardStreamableHTTPServerTransport` (Deno-native) |
| TR-02 | Stateless mode (no session tracking — each request creates transport) |
| TR-03 | MCP endpoint at `POST /functions/v1/mcp` |
| TR-04 | Full MCP protocol compliance (JSON-RPC 2.0) |
| TR-05 | Hono framework for HTTP routing within Edge Function |

### 4.6 Website (Vercel / Next.js)

| ID | Requirement |
|----|------------|
| WEB-01 | Landing page with project description, setup guide, GitHub link |
| WEB-02 | OAuth consent screen at configured authorization path (e.g., `/oauth/consent`) |
| WEB-03 | Login page (GitHub via Supabase Auth) |
| WEB-04 | Migration page: drag & drop upload `memory.json` / `memory.jsonl` |
| WEB-05 | Migration page: auto-detect format, preview data, validate before import |
| WEB-06 | Migration page: progress feedback during import (entity/relation counts) |
| WEB-07 | Migration page: idempotent — re-importing same file doesn't create duplicates |
| WEB-08 | Dashboard: graph stats (entity count, relation count, last updated) |
| WEB-09 | Dashboard: export/download graph as JSONL or JSON |
| WEB-10 | Responsive, modern UI |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement |
|----|------------|
| PERF-01 | CRUD operations respond within 200ms (p95) |
| PERF-02 | `read_graph` with 10,000 entities responds within 2s |
| PERF-03 | Edge Functions cold start within 500ms |

### 5.2 Security

| ID | Requirement |
|----|------------|
| SEC-01 | JWT validated on every request (signature via JWKS, expiry, audience) |
| SEC-02 | All queries parameterized (SQL injection prevention) |
| SEC-03 | RLS enforces namespace isolation — users can only access their own data |
| SEC-04 | Supabase service role key never exposed to client |
| SEC-05 | HTTPS enforced (Supabase provides this by default) |

### 5.3 Reliability

| ID | Requirement |
|----|------------|
| REL-01 | PostgreSQL transactions for all write operations |
| REL-02 | Structured error responses with actionable messages |
| REL-03 | Supabase handles DB connection pooling and failover |

### 5.4 Deployability

| ID | Requirement |
|----|------------|
| DEP-01 | Supabase Edge Functions deployed via `supabase functions deploy` |
| DEP-02 | Vercel deploys via `git push` to main branch |
| DEP-03 | Local dev via `supabase start` + `next dev` |
| DEP-04 | Environment variables managed via Supabase Dashboard + Vercel Dashboard |

---

## 6. Data Model

### 6.1 Original Format (JSONL)

```jsonl
{"type":"entity","name":"John_Smith","entityType":"person","observations":["Speaks fluent Spanish","Graduated in 2019"]}
{"type":"entity","name":"Anthropic","entityType":"organization","observations":["AI safety company"]}
{"type":"relation","from":"John_Smith","to":"Anthropic","relationType":"works_at"}
```

### 6.2 PostgreSQL Schema

```sql
-- Namespaces: one per Supabase Auth user (auto-created on first request)
CREATE TABLE namespaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  display_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Entities: knowledge graph nodes
CREATE TABLE entities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id  UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(namespace_id, name)
);

-- Observations: facts attached to entities
CREATE TABLE observations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Relations: directed edges between entities
CREATE TABLE relations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id    UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  from_entity     UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(namespace_id, from_entity, to_entity, relation_type)
);
```

### 6.3 Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE namespaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE relations ENABLE ROW LEVEL SECURITY;

-- Namespaces: users can only access their own
CREATE POLICY namespaces_policy ON namespaces
  FOR ALL USING (user_id = auth.uid());

-- Entities: users can only access entities in their namespace
CREATE POLICY entities_policy ON entities
  FOR ALL USING (
    namespace_id IN (SELECT id FROM namespaces WHERE user_id = auth.uid())
  );

-- Observations: users can only access observations on their entities
CREATE POLICY observations_policy ON observations
  FOR ALL USING (
    entity_id IN (
      SELECT e.id FROM entities e
      JOIN namespaces n ON e.namespace_id = n.id
      WHERE n.user_id = auth.uid()
    )
  );

-- Relations: users can only access relations in their namespace
CREATE POLICY relations_policy ON relations
  FOR ALL USING (
    namespace_id IN (SELECT id FROM namespaces WHERE user_id = auth.uid())
  );
```

### 6.4 Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `namespaces` | `UNIQUE(user_id)` | Fast user lookup (FK to auth.users) |
| `entities` | `UNIQUE(namespace_id, name)` | Entity name uniqueness per namespace |
| `entities` | `INDEX(namespace_id)` | Fast namespace-scoped queries |
| `observations` | `INDEX(entity_id)` | Fast observation lookup by entity |
| `relations` | `UNIQUE(namespace_id, from_entity, to_entity, relation_type)` | Relation deduplication |
| `relations` | `INDEX(namespace_id)` | Fast namespace-scoped queries |
| `relations` | `INDEX(from_entity)`, `INDEX(to_entity)` | Efficient relation traversal |

---

## 7. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| MCP Server Runtime | Supabase Edge Functions (Deno 2) | Official MCP server hosting support, serverless, auto-scaling |
| MCP Transport | `WebStandardStreamableHTTPServerTransport` | Deno-native, Web Standard APIs |
| MCP SDK | `@modelcontextprotocol/sdk` v1.25+ | Production-stable, Streamable HTTP support |
| HTTP Routing | Hono | Lightweight, Edge-native, recommended by Supabase |
| Database | Supabase PostgreSQL | Managed, RLS built-in, no infra to manage |
| Auth | Supabase Auth (OAuth 2.1 Server) | MCP-compatible OAuth, DCR, GitHub provider, JWT issuance |
| Website | Next.js on Vercel | Fast, SSR/SSG, Supabase SSR integration |
| Validation | Zod | Schema validation for MCP tools and API inputs |
| DB Client | `@supabase/supabase-js` | Official Supabase client, RLS-aware queries |

---

## 8. MCP Client Configuration

### 8.1 Cursor

```json
{
  "mcpServers": {
    "gsm": {
      "url": "https://<project-ref>.supabase.co/functions/v1/mcp"
    }
  }
}
```

No API keys. No headers. Cursor auto-discovers OAuth metadata from Supabase Auth, opens browser for GitHub login, stores token in OS Keychain.

### 8.2 Claude Code

```bash
claude mcp add gsm --transport http https://<project-ref>.supabase.co/functions/v1/mcp
```

Claude Code opens browser → GitHub login via Supabase Auth → token stored securely.

### 8.3 Migration Workflow

```
1. Go to https://gsm.example.com/migrate (Vercel website)

2. Login with GitHub (via Supabase Auth)

3. Upload your memory.json or memory.jsonl file
   - Auto-detects format
   - Shows preview of entities/relations
   - Validates data

4. Click "Import" — data is written to your namespace

5. Add GSM to your MCP client (see 8.1 / 8.2)

6. AI immediately has all previous memories available
```

---

## 9. Phased Delivery

### Phase 1a — Core MCP ✦ (Start Here)

> Goal: MCP server fully working and testable in Cursor / Claude Code. No website needed.

**Supabase Setup**
- [ ] Supabase project init (`supabase init`)
- [ ] PostgreSQL schema + RLS policies (`supabase/migrations/`)
- [ ] Enable OAuth 2.1 Server + Dynamic Client Registration
- [ ] Configure GitHub as social login provider
- [ ] Seed / local dev setup

**Edge Functions**
- [ ] `mcp` function: 9 knowledge graph tools over Streamable HTTP (Hono + `WebStandardStreamableHTTPServerTransport`)
- [ ] JWT validation middleware (verify Supabase JWT, extract `user_id`)
- [ ] Namespace auto-creation on first authenticated request
- [ ] `health` function: DB connectivity check
- [ ] `_shared/types.ts`: Entity, Relation, KnowledgeGraph interfaces
- [ ] `_shared/graph-manager.ts`: all DB operations
- [ ] `_shared/auth.ts`: JWT validation helper

**Validation**
- [ ] Connect from Cursor — tools appear and function correctly
- [ ] Connect from Claude Code — tools appear and function correctly
- [ ] Concurrent access from two clients — no data corruption
- [ ] GitHub login flow works end-to-end

### Phase 1b — Website & Migration

> Goal: User-facing website for onboarding, migration, and basic data management.

**Vercel Website (Next.js)**
- [ ] OAuth consent screen (`/oauth/consent`) — required for OAuth flow
- [ ] Login page (GitHub via Supabase Auth)
- [ ] Landing page (what is GSM, how to set up, MCP config snippet)
- [ ] Migration page (drag & drop upload, format detection, preview, import)
- [ ] Dashboard: entity/relation counts, entity explorer, delete, export

**Documentation**
- [ ] README: project overview, Supabase setup, MCP client configuration
- [ ] MCP client setup guide (Cursor, Claude Code)

### Phase 2 — Production Hardening

> Goal: Ready for real-world multi-user usage

- [ ] Rate limiting (Supabase Edge Function level)
- [ ] Enhanced search (PostgreSQL `tsvector` full-text search)
- [ ] Structured request logging
- [ ] Input validation hardening (max entity size, graph size limits)
- [ ] Token refresh handling
- [ ] CI/CD pipeline (GitHub Actions → Supabase + Vercel)

### Phase 3 — Scale & Features

> Goal: Advanced features, community growth

- [ ] Visual graph explorer (force-directed graph)
- [ ] Graph change history / audit log
- [ ] Bulk operations (multi-select delete, batch import)
- [ ] Graph analytics (entity type breakdown, growth timeline)
- [ ] Webhook notifications on graph changes
- [ ] Custom domain for Edge Functions

---

## 10. Project Structure

```
gsm/
├── supabase/
│   ├── config.toml                    # Supabase project config
│   ├── migrations/
│   │   └── 001_initial_schema.sql     # Tables, RLS, indexes
│   └── functions/
│       ├── mcp/
│       │   └── index.ts               # MCP Streamable HTTP server (9 tools)
│       ├── health/
│       │   └── index.ts               # Health check
│       └── _shared/
│           ├── graph-manager.ts       # KnowledgeGraphManager (DB operations)
│           ├── types.ts               # Entity, Relation, KnowledgeGraph interfaces
│           └── auth.ts                # JWT validation helper
├── web/                               # Next.js app (Vercel)
│   ├── package.json
│   ├── next.config.js
│   ├── app/
│   │   ├── page.tsx                   # Landing page
│   │   ├── login/page.tsx             # GitHub login
│   │   ├── oauth/consent/page.tsx     # OAuth consent screen
│   │   ├── migrate/page.tsx           # Migration UI (upload, preview, import)
│   │   ├── dashboard/page.tsx         # Graph stats + export
│   │   └── api/oauth/decision/route.ts # Consent approve/deny handler
│   └── lib/
│       ├── supabase.ts                # Supabase SSR client
│       └── migration.ts               # Import parser (JSON/JSONL), validator, DB writer
├── docs/
│   └── req_analysis.md                # This document
└── README.md
```

---

## 11. Local Development

```bash
# 1. Start Supabase locally
supabase start

# 2. Serve Edge Functions
supabase functions serve --no-verify-jwt

# 3. Start Next.js dev server (in web/ directory)
cd web && npm run dev

# Edge Functions: http://localhost:54321/functions/v1/mcp
# Website:        http://localhost:3000
# Supabase Studio: http://localhost:54323
```

---

## 12. Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| 1 | Maximum graph size per namespace? (entity/relation limits) | Affects query performance and Supabase plan sizing | Open |
| 2 | Should `search_nodes` use `ILIKE` (compatible) or `tsvector` (better) in Phase 1? | Search quality vs compatibility | Lean: `ILIKE` for Phase 1 |
| 3 | Custom domain for Edge Functions or use `<ref>.supabase.co`? | Affects MCP client config URL | Lean: default URL for MVP |
| 4 | Supabase free tier vs Pro for production? | Edge Function limits, DB size, Auth quotas | Open |
| 5 | Should the consent screen auto-approve for returning users? | UX vs security | Open |
| 6 | Need `/.well-known/oauth-protected-resource` PRM endpoint? | MCP clients may need this for auth discovery | Need to verify |
