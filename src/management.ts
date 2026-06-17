// Management tools — drive your Flarelink projects (list, inspect D1, query,
// list R2) from the AI editor. All authenticated with FLARELINK_API_KEY and
// routed through the dashboard API, so they act exactly as you would in the UI.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { flarelinkFetch } from './flarelink-api.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function ok(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}
function fail(err: unknown): ToolResult {
  return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true };
}
function json(value: unknown): string {
  return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
}

export function registerManagementTools(server: McpServer) {
  server.registerTool(
    'flarelink_whoami',
    {
      title: 'Flarelink — who am I',
      description:
        'Verify the FLARELINK_API_KEY and show the signed-in user plus the active Cloudflare connection and project. Call this first to confirm management tools are wired up.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(json(await flarelinkFetch('/api/me')));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'flarelink_list_projects',
    {
      title: 'Flarelink — list projects',
      description: 'List the Flarelink projects on the active Cloudflare connection.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(json(await flarelinkFetch('/api/projects')));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'flarelink_list_databases',
    {
      title: 'Flarelink — list D1 databases',
      description:
        'List the D1 databases attached to the active Flarelink project (id, name, whether it hosts the auth module).',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(json(await flarelinkFetch('/api/d1/databases')));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'flarelink_query_database',
    {
      title: 'Flarelink — query a D1 database',
      description:
        'Run a SQL statement against one of the project\'s D1 databases via Flarelink. Use bound parameters (? placeholders + params) — never concatenate user input. Returns rows + query meta (duration, rows_read/written). This runs with full database access; prefer SELECT unless you intend to write.',
      inputSchema: {
        databaseId: z.string().describe('D1 database id (uuid) — from flarelink_list_databases.'),
        sql: z.string().describe('SQL with ? placeholders for any values.'),
        params: z
          .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .optional()
          .describe('Values bound to the ? placeholders, in order.'),
      },
    },
    async ({ databaseId, sql, params }) => {
      try {
        const out = await flarelinkFetch(`/api/d1/query/${encodeURIComponent(databaseId)}`, {
          method: 'POST',
          body: { sql, params: params ?? [] },
        });
        return ok(json(out));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'flarelink_list_buckets',
    {
      title: 'Flarelink — list R2 buckets',
      description: 'List the R2 buckets attached to the active Flarelink project.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(json(await flarelinkFetch('/api/r2/buckets')));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
