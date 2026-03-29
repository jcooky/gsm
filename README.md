# GSM — Global Shared Memory

A cloud-hosted remote MCP server that gives your AI a persistent, shared knowledge graph — accessible from any device or IDE.

Built on [Supabase](https://supabase.com) Edge Functions + PostgreSQL, with GitHub OAuth via the [MCP Authorization spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization).

## How it works

GSM is a drop-in cloud replacement for the [MCP Memory Server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory). It exposes the same 9 tools (`create_entities`, `create_relations`, `add_observations`, `delete_entities`, `delete_observations`, `delete_relations`, `read_graph`, `search_nodes`, `open_nodes`) over Streamable HTTP transport, with each user's knowledge graph isolated by GitHub identity.

## MCP Client Setup

### Cursor

```json
{
  "mcpServers": {
    "gsm": {
      "url": "https://<project-ref>.supabase.co/functions/v1/mcp"
    }
  }
}
```

### Claude Code

```bash
claude mcp add gsm --transport http https://<project-ref>.supabase.co/functions/v1/mcp
```

On first use, your client will open a browser window for GitHub login. After that, authentication is automatic.

## Migrating from local memory server

If you have an existing `memory.json` or `memory.jsonl` file, you can import it via the GSM website (coming in Phase 1b).

## Local Development

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Docker](https://docs.docker.com/get-docker/) (required by Supabase local stack)
- A [GitHub OAuth App](https://github.com/settings/developers) with callback URL `http://localhost:54321/auth/v1/callback`

### Setup

```bash
# 1. Clone and enter the repo
git clone https://github.com/your-org/gsm
cd gsm

# 2. Copy env example and fill in your GitHub OAuth credentials
cp .env.local.example .env.local

# 3. Start Supabase local stack
supabase start

# 4. Serve Edge Functions
supabase functions serve

# MCP endpoint:   http://localhost:54321/functions/v1/mcp
# Health check:   http://localhost:54321/functions/v1/health
# Supabase Studio: http://localhost:54323
```

### Deploying to Supabase Cloud

```bash
# Link to your Supabase project
supabase link --project-ref <your-project-ref>

# Push DB migrations
supabase db push

# Set GitHub OAuth secrets
supabase secrets set SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID=<id>
supabase secrets set SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET=<secret>

# Deploy Edge Functions
supabase functions deploy mcp
supabase functions deploy health
```

## Project Structure

```
gsm/
├── supabase/
│   ├── config.toml                         # Supabase config (GitHub OAuth, OAuth 2.1 server)
│   ├── migrations/
│   │   └── 20250329000000_initial_schema.sql  # Tables, RLS, indexes
│   └── functions/
│       ├── mcp/index.ts                    # MCP Streamable HTTP server (9 tools)
│       ├── health/index.ts                 # Health check endpoint
│       └── _shared/
│           ├── types.ts                    # Entity, Relation, KnowledgeGraph types
│           ├── auth.ts                     # JWT authentication helper
│           └── graph-manager.ts            # All knowledge graph DB operations
├── docs/
│   └── req_analysis.md                     # Requirements analysis
├── .env.local.example
└── README.md
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| MCP Server | Supabase Edge Functions (Deno 2) |
| MCP Transport | `WebStandardStreamableHTTPServerTransport` |
| HTTP Routing | Hono |
| Database | Supabase PostgreSQL + RLS |
| Auth | Supabase Auth (OAuth 2.1 Server + GitHub) |
| Website (Phase 1b) | Next.js on Vercel |
