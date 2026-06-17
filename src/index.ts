import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  STACK_GUIDE,
  SCAFFOLD_GUIDE,
  PATTERNS,
  PATTERN_KEYS,
  SDK_REFERENCE,
  COST_PATTERNS,
} from './content.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

const server = new McpServer({ name: 'flarelink', version: '0.1.0' });

// --- resources (attachable context) ----------------------------------------

server.registerResource(
  'stack-guide',
  'flarelink://stack-guide',
  {
    title: 'Flarelink stack guide',
    description: 'Architecture, cardinal rules, and deployment shapes for the Flarelink stack.',
    mimeType: 'text/markdown',
  },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'text/markdown', text: STACK_GUIDE }],
  }),
);

// --- tools ------------------------------------------------------------------

server.registerTool(
  'flarelink_stack_overview',
  {
    title: 'Flarelink stack overview',
    description:
      'Read this first. The Flarelink stack (Cloudflare auth via better-auth + KV sessions, D1, R2), its cardinal rules, and the two deployment shapes. Call before building auth/database/file features on Cloudflare.',
    inputSchema: {},
  },
  async () => text(STACK_GUIDE),
);

server.registerTool(
  'flarelink_scaffold',
  {
    title: 'Scaffold a Flarelink-stack app',
    description:
      'How to bootstrap a complete, working Flarelink-stack app (auth + D1 + R2): clone command, one-click deploy, file map, and where to add features.',
    inputSchema: {},
  },
  async () => text(SCAFFOLD_GUIDE),
);

server.registerTool(
  'flarelink_list_patterns',
  {
    title: 'List Flarelink code patterns',
    description:
      'List the available canonical code patterns (keys + what each is for). Use flarelink_get_pattern to fetch one.',
    inputSchema: {},
  },
  async () =>
    text(
      '# Flarelink code patterns\n\n' +
        PATTERN_KEYS.map((k) => `- **${k}** — ${PATTERNS[k].title}\n  _When:_ ${PATTERNS[k].when}`).join(
          '\n',
        ) +
        '\n\nFetch one with flarelink_get_pattern({ pattern }).',
    ),
);

server.registerTool(
  'flarelink_get_pattern',
  {
    title: 'Get a Flarelink code pattern',
    description:
      'Return the canonical, copy-pasteable code for one Flarelink-stack recipe (auth setup, route guards, identifier-safe D1 queries, R2 uploads/presigning, wrangler bindings, SDK usage). Prefer these over inventing your own — they encode the security + cost rules.',
    inputSchema: {
      pattern: z
        .enum(PATTERN_KEYS as [string, ...string[]])
        .describe('Which pattern to fetch. Use flarelink_list_patterns to see the options.'),
    },
  },
  async ({ pattern }) => {
    const p = PATTERNS[pattern];
    if (!p) return text(`Unknown pattern "${pattern}". Options: ${PATTERN_KEYS.join(', ')}`);
    return text(
      `# ${p.title}\n\n**When:** ${p.when}\n\n\`\`\`ts\n${p.code}\n\`\`\`${
        p.notes ? `\n\n**Notes:** ${p.notes}` : ''
      }`,
    );
  },
);

server.registerTool(
  'flarelink_sdk_reference',
  {
    title: '@flarelink/client SDK reference',
    description:
      'Signatures and return shapes for the @flarelink/client SDK (auth / storage / db). Use when the app talks to a hosted Flarelink auth Worker rather than embedding better-auth.',
    inputSchema: {
      surface: z
        .enum(['auth', 'storage', 'db', 'all'])
        .optional()
        .describe('Which surface to return. Defaults to all.'),
    },
  },
  async ({ surface }) => {
    const order: Array<'auth' | 'storage' | 'db'> = ['auth', 'storage', 'db'];
    const pick = !surface || surface === 'all' ? order : [surface];
    return text(
      '# @flarelink/client\n\nServer-only surfaces require a `serviceKey` — never ship it to the browser.\n\n' +
        pick.map((s) => SDK_REFERENCE[s]).join('\n\n'),
    );
  },
);

const COST_HINTS: Array<{ re: RegExp; hint: string }> = [
  { re: /session|login|sign[- ]?in|token|jwt/i, hint: 'Sessions/tokens → KV, not D1 (pattern 1).' },
  { re: /file|upload|image|video|photo|attachment|avatar|asset/i, hint: 'Files → R2 with presigned URLs, never proxied through the Worker (pattern 3).' },
  { re: /list|feed|public|read[- ]?heavy|homepage|catalog/i, hint: 'Read-heavy/list endpoints → put the Cache API in front of D1 (pattern 2).' },
  { re: /poll|wait|status|progress|job|background|cron/i, hint: 'Polling for job status → use Queues or a Durable Object alarm and push completion (pattern 5).' },
  { re: /each|loop|for .*(fetch|query|select)|per[- ]?(user|item|row)/i, hint: 'Per-item queries in a loop → batch into one `WHERE id IN (...)` or env.DB.batch (pattern 4).' },
  { re: /chat|presence|realtime|multiplayer|room|collaborat/i, hint: 'Realtime per-room state → Durable Objects, not D1 polling (pattern 6).' },
];

server.registerTool(
  'flarelink_cost_patterns',
  {
    title: 'Cloudflare cost-optimization patterns',
    description:
      'Design guidance (not a live usage meter) for keeping a Cloudflare bill near zero. Optionally describe the feature you are building to get targeted hints first.',
    inputSchema: {
      feature: z
        .string()
        .optional()
        .describe('Optional: describe the feature/data shape (e.g. "user avatar uploads") for targeted hints.'),
    },
  },
  async ({ feature }) => {
    let head = '';
    if (feature) {
      const hits = COST_HINTS.filter((h) => h.re.test(feature)).map((h) => `- ${h.hint}`);
      head = hits.length
        ? `## For "${feature}"\n${hits.join('\n')}\n\n`
        : `## For "${feature}"\nNo specific red flags matched — apply the general patterns below.\n\n`;
    }
    return text(head + COST_PATTERNS);
  },
);

// --- start ------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP wire protocol.
  console.error('flarelink-mcp running on stdio');
}

main().catch((err) => {
  console.error('flarelink-mcp failed to start:', err);
  process.exit(1);
});
