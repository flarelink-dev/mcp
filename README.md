# @flarelink/mcp

An [MCP](https://modelcontextprotocol.io) server that teaches your AI coding tool to build correctly on the **Flarelink stack** — Cloudflare auth (better-auth + KV sessions), D1, and R2 — from inside Cursor, Claude Code, Windsurf, and anything else that speaks MCP.

It hands the agent the security and cost rules up front (user-scoping, identifier-safe SQL, KV sessions, presigned R2) so the generated code is right the first time, instead of the agent guessing and you debugging.

## Install

No install needed — run it with `npx`. Add it to your tool's MCP config:

**Claude Code**

```bash
claude mcp add flarelink -- npx -y @flarelink/mcp
```

**Cursor / Windsurf / Claude Desktop** (`mcp.json` / config):

```json
{
  "mcpServers": {
    "flarelink": {
      "command": "npx",
      "args": ["-y", "@flarelink/mcp"],
      "env": { "FLARELINK_API_KEY": "flk_…" }
    }
  }
}
```

The `FLARELINK_API_KEY` is **optional**. Without it you still get all the
knowledge + scaffolding tools. With it, the **management tools** (below) can
drive your actual Flarelink projects. Mint a key at
[dash.flarelink.dev → API keys](https://dash.flarelink.dev).

## Tools

| Tool | What it gives the agent |
| --- | --- |
| `flarelink_stack_overview` | The stack, cardinal rules, and deployment shapes. Read first. |
| `flarelink_scaffold` | How to bootstrap a complete working app (clone / one-click deploy) + file map. |
| `flarelink_list_patterns` | The catalog of canonical code patterns. |
| `flarelink_get_pattern` | Copy-pasteable code for one recipe (auth setup, route guards, identifier-safe D1, R2 upload/presign, wrangler bindings, SDK usage). |
| `flarelink_sdk_reference` | `@flarelink/client` signatures + return shapes (auth / storage / db). |
| `flarelink_cost_patterns` | Cloudflare cost-optimization guidance, with targeted hints for the feature you describe. |

It also exposes the stack guide as a resource (`flarelink://stack-guide`) you can attach as context.

### Management tools (need `FLARELINK_API_KEY`)

Drive your actual Flarelink projects from the editor. These route through the Flarelink dashboard API and act exactly as you would in the UI.

| Tool | What it does |
| --- | --- |
| `flarelink_whoami` | Verify the key; show the user + active connection/project. |
| `flarelink_list_projects` | List projects on the active Cloudflare connection. |
| `flarelink_list_databases` | List the project's D1 databases. |
| `flarelink_query_database` | Run a (parameterized) SQL statement against a project D1. |
| `flarelink_list_buckets` | List the project's R2 buckets. |

Without a key they return a clear "set `FLARELINK_API_KEY`" message. The key has the same access as your Flarelink login — treat it like a password.

## License

MIT. Part of [Flarelink](https://flarelink.dev) — the dashboard for the Cloudflare developer stack.
