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
      "args": ["-y", "@flarelink/mcp"]
    }
  }
}
```

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

## What's next

This first release is **knowledge + scaffolding** — it needs no Flarelink account and changes nothing in your project on its own; the agent acts on what it returns.

A follow-up release adds **management tools** (authenticated with a Flarelink API key): list/provision projects, query a project's D1, manage R2, and inspect auth users — so you can drive your Flarelink backend from the same chat.

## License

MIT. Part of [Flarelink](https://flarelink.dev) — the dashboard for the Cloudflare developer stack.
