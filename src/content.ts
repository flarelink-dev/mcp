// The knowledge this MCP server hands to an AI coding agent. All static — no
// network, no backend. Grounded in the Edge Full-Stack Starter
// (github.com/flarelink-dev/cloudflare-edge-fullstack-starter) and the
// @flarelink/client SDK so the patterns match shipping code.

export const STACK_GUIDE = `# The Flarelink stack

A full-stack app on Cloudflare's edge, wired the cost-efficient way:

- **Auth** — email/password via better-auth. Sessions live in **KV**, so the
  auth check on every request is a fast edge read, not a billed D1 row read.
- **Database** — **D1** (SQLite). App tables and the auth tables (user /
  account / verification) share ONE database, so foreign keys and joins work.
- **Files** — **R2** object storage (no egress fees).

## Cardinal rules

1. **Scope every data access to the signed-in user.** Resolve the user from the
   session, then \`WHERE user_id = <session user id>\`. Never return or mutate
   another user's rows. Gate R2 object access on a per-user key prefix.
2. **Sessions belong in KV, not D1.** Use better-auth's \`secondaryStorage\` +
   \`storeSessionInDatabase: false\`. Do NOT enable cookieCache with
   secondaryStorage (better-auth #4203 logs users out after 5 minutes).
3. **Bind values, never interpolate them into SQL.** Use \`?\` placeholders +
   \`.bind(...)\`. Table/column names can't be bound — validate any dynamic
   identifier against a fixed allowlist; prefer fixed literals.
4. **Auth is same-origin when the SPA + API are one Worker** — the session
   cookie is first-party (works in Safari, no custom domain needed). If you
   split the API onto another origin, you need \`SameSite=None; Secure\`.
5. **Don't proxy file bytes through the Worker at scale.** The simple path is
   \`env.BUCKET.put(...)\`; the cost-optimal path is presigned direct-to-R2
   uploads (needs an R2 S3 keypair + SigV4).

## Two deployment shapes

- **Self-contained** (the Edge starter): better-auth runs as a library inside
  your app's Worker. One Worker, bindings DB / SESSIONS / BUCKET, one secret
  BETTER_AUTH_SECRET. Best for "I own everything on my CF account."
- **Hosted auth Worker + SDK**: a separate Flarelink auth Worker holds auth +
  storage; your app calls it through \`@flarelink/client\`. Best when the
  Flarelink dashboard provisions and manages the project for you.

Use \`flarelink_scaffold\` to bootstrap the self-contained shape, and
\`flarelink_get_pattern\` for individual recipes.`;

export const SCAFFOLD_GUIDE = `# Scaffolding a Flarelink-stack app

The fastest start is the **Edge Full-Stack Starter** — a complete, working app
(auth + D1 notes + R2 uploads) on one Worker.

## Option A — clone it
\`\`\`bash
npx degit flarelink-dev/cloudflare-edge-fullstack-starter my-app
cd my-app
npm install
cp .dev.vars.example .dev.vars   # set BETTER_AUTH_SECRET to a random string
npm run dev                       # http://localhost:5173 (local emulated D1/KV/R2)
\`\`\`

## Option B — one-click deploy
Deploy to Cloudflare (auto-provisions D1 + KV + R2):
https://deploy.workers.cloudflare.com/?url=https://github.com/flarelink-dev/cloudflare-edge-fullstack-starter

## File map
- \`server/index.ts\` — Hono app: /api/auth/* (better-auth), /api/notes (D1),
  /api/files (R2), and the SPA.
- \`server/auth.ts\` — better-auth config (KV sessions, PBKDF2 hashing).
- \`server/ensure-schema.ts\` — creates tables on first request if missing.
- \`client/\` — React 19 + Vite + Tailwind SPA.
- \`wrangler.jsonc\` — DB (D1) / SESSIONS (KV) / BUCKET (R2) bindings.

Then build features by adding routes in \`server/index.ts\` (each gated by the
\`requireUser\` middleware) and tables in \`server/ensure-schema.ts\`. See
\`flarelink_get_pattern\` for the exact recipes.

To manage the app's backend with a dashboard (table editor, users admin, files,
activity log), connect it at https://flarelink.dev.`;

export type Pattern = {
  title: string;
  when: string;
  code: string;
  notes?: string;
};

export const PATTERNS: Record<string, Pattern> = {
  'better-auth-setup': {
    title: 'better-auth with KV sessions + PBKDF2 (Cloudflare-safe)',
    when: 'Setting up auth in a Worker. This is the foundation; everything else builds on it.',
    code: `// server/auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { schema } from './schema.ts'; // user / account / verification tables

// 100k fits the Workers FREE plan's ~10ms CPU budget per sign-in. better-auth's
// default scrypt-via-wasm intermittently 1102s there; native PBKDF2 is ~1-5ms.
const PBKDF2_ITERATIONS = 100_000;

export function createAuth(env, baseURL) {
  const db = drizzle(env.DB, { schema });
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: [baseURL], // same-origin app
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // turn on once an email sender is wired
      password: { hash: hashPassword, verify: verifyPassword }, // PBKDF2, see notes
    },
    // Sessions in KV only — the cost lever.
    session: { storeSessionInDatabase: false, expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    secondaryStorage: {
      get: async (k) => (await env.SESSIONS.get(k)) ?? null,
      set: async (k, v, ttl) => env.SESSIONS.put(k, v, ttl != null ? { expirationTtl: Math.max(ttl, 60) } : undefined),
      delete: async (k) => env.SESSIONS.delete(k),
    },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
  });
}`,
    notes:
      'hashPassword/verifyPassword are PBKDF2-SHA256 via Web Crypto (no wasm). Do NOT add a session table or enable cookieCache — KV is the only session store. Get the full hashing helpers from flarelink_get_pattern("pbkdf2-hashing").',
  },
  'pbkdf2-hashing': {
    title: 'PBKDF2-SHA256 password hashing via Web Crypto',
    when: 'Needed by better-auth-setup. Native, no wasm, fits the Workers free-tier CPU budget.',
    code: `const ITER = 100_000;
const b64 = (b) => btoa(String.fromCharCode(...b));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(pw, salt, iter, bytes) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, bytes * 8));
}
export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return \`pbkdf2$\${ITER}$\${b64(salt)}$\${b64(await pbkdf2(pw, salt, ITER, 32))}\`;
}
export async function verifyPassword({ hash, password }) {
  const [tag, iter, salt, want] = hash.split('$');
  if (tag !== 'pbkdf2') return false;
  const got = await pbkdf2(password, unb64(salt), +iter, unb64(want).length);
  const exp = unb64(want);
  let diff = got.length ^ exp.length;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ exp[i];
  return diff === 0;
}`,
  },
  'auth-routes': {
    title: 'Mount better-auth + a requireUser middleware in Hono',
    when: 'Wiring the auth handler and protecting your own routes.',
    code: `import { Hono } from 'hono';
import { createAuth } from './auth.ts';

const app = new Hono();

// better-auth owns everything under /api/auth/*
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  const baseURL = new URL(c.req.url).origin;
  return createAuth(c.env, baseURL).handler(c.req.raw);
});

// Gate your own routes: resolve the user or 401.
export const requireUser = async (c, next) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Not signed in' }, 401);
  c.set('user', { id: session.user.id, email: session.user.email });
  await next();
};

app.get('/api/notes', requireUser, async (c) => { /* WHERE user_id = c.var.user.id */ });`,
  },
  'd1-schema-ensure': {
    title: 'Idempotent schema bootstrap (self-healing on a fresh D1)',
    when: 'So a brand-new/empty D1 works with no migration step. Runs once per isolate.',
    code: `let ensured = null;
const DDL = [
  \`CREATE TABLE IF NOT EXISTS "user" ("id" TEXT PRIMARY KEY NOT NULL, "name" TEXT NOT NULL,
     "email" TEXT NOT NULL, "email_verified" INTEGER NOT NULL DEFAULT 0, "image" TEXT,
     "created_at" INTEGER NOT NULL, "updated_at" INTEGER NOT NULL)\`,
  \`CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email")\`,
  // ...account, verification (better-auth), then YOUR tables FK'ing user(id)...
  \`CREATE TABLE IF NOT EXISTS "notes" ("id" TEXT PRIMARY KEY NOT NULL,
     "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
     "content" TEXT NOT NULL, "created_at" INTEGER NOT NULL DEFAULT (unixepoch() * 1000))\`,
];
export function ensureSchema(env) {
  if (!ensured) ensured = env.DB.batch(DDL.map((s) => env.DB.prepare(s)))
    .then(() => {}).catch((e) => { ensured = null; throw e; });
  return ensured;
}
// Call \`await ensureSchema(c.env)\` in an /api/* middleware before any query.`,
    notes:
      'For the production migration path use `wrangler d1 migrations apply`; ensureSchema is the zero-config safety net so a freshly-provisioned D1 just works.',
  },
  'd1-query': {
    title: 'Identifier-safe, user-scoped D1 query',
    when: 'Reading/writing app data. The security-critical pattern.',
    code: `// list — scoped to the signed-in user, values bound
const { results } = await c.env.DB
  .prepare('SELECT id, content, created_at FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 200')
  .bind(c.var.user.id)
  .all();

// insert — RETURNING gives you the new row
const row = await c.env.DB
  .prepare('INSERT INTO notes (id, user_id, content) VALUES (?, ?, ?) RETURNING *')
  .bind(crypto.randomUUID(), c.var.user.id, content)
  .first();

// delete — always include the user_id in the WHERE so one user can't delete another's row
await c.env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
  .bind(id, c.var.user.id).run();`,
    notes:
      'Never string-concat user input into SQL. Table/column names cannot be bound — if a name is dynamic, check it against a fixed allowlist first.',
  },
  'r2-upload-binding': {
    title: 'R2 upload through the Worker binding (zero-config path)',
    when: 'Simple file uploads. Needs only the R2 binding. Bytes flow through the Worker.',
    code: `// upload — key prefixed by user id so downloads can be access-checked cheaply
app.post('/api/files', requireUser, async (c) => {
  const name = (c.req.header('x-filename') ?? 'file').replace(/[^\\w.\\-]+/g, '_');
  const key = \`uploads/\${c.var.user.id}/\${crypto.randomUUID()}/\${name}\`;
  await c.env.BUCKET.put(key, c.req.raw.body, { httpMetadata: { contentType: c.req.header('content-type') } });
  return c.json({ key });
});

// download — refuse any key not under the caller's prefix
app.get('/api/files', requireUser, async (c) => {
  const key = c.req.query('key') ?? '';
  if (!key.startsWith(\`uploads/\${c.var.user.id}/\`)) return c.json({ error: 'forbidden' }, 403);
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.json({ error: 'not found' }, 404);
  const h = new Headers(); obj.writeHttpMetadata(h);
  return new Response(obj.body, { headers: h });
});`,
    notes:
      'This proxies bytes through the Worker — fine for a demo / small files. For scale, switch to presigned direct-to-R2: flarelink_get_pattern("r2-presigned").',
  },
  'r2-presigned': {
    title: 'Presigned direct-to-R2 upload (cost-optimal path)',
    when: 'Production file uploads — bytes never touch the Worker (no CPU, no body limits).',
    code: `// Server mints a presigned PUT URL with SigV4 (needs an R2 S3 keypair:
//   R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).
// The browser then PUTs the file DIRECTLY to R2 using EXACTLY the signed headers.
app.post('/api/presign', requireUser, async (c) => {
  const { key, contentType } = await c.req.json();
  const safeKey = \`uploads/\${c.var.user.id}/\${key}\`;
  const url = await presignR2Put({
    accountId: c.env.R2_ACCOUNT_ID,
    accessKeyId: c.env.R2_ACCESS_KEY_ID,
    secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    bucket: c.env.BUCKET_NAME, key: safeKey, contentType, expiresIn: 300,
  });
  return c.json({ url, signedHeaders: { 'content-type': contentType } });
});
// Browser: fetch(url, { method: 'PUT', headers: signedHeaders, body: file })
// Adding/omitting headers breaks the SigV4 signature -> 403 SignatureDoesNotMatch.`,
    notes:
      'The R2 binding cannot mint presigned URLs — you sign with the S3 API (region "auto", service "s3", host <accountId>.r2.cloudflarestorage.com, UNSIGNED-PAYLOAD). The Flarelink dashboard provisions the R2 keypair + signing for you if you do not want to hand-roll SigV4.',
  },
  'wrangler-config': {
    title: 'wrangler.jsonc bindings for the stack',
    when: 'Declaring D1 + KV + R2 + assets + the auth secret.',
    code: `{
  "name": "my-app",
  "main": "./server/index.ts",
  "compatibility_date": "2025-05-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist/client",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]   // keep the auth API off the SPA edge cache
  },
  "d1_databases": [{ "binding": "DB", "database_name": "my-app-db", "database_id": "<id>", "migrations_dir": "./migrations" }],
  "kv_namespaces": [{ "binding": "SESSIONS", "id": "<id>" }],
  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "my-app-uploads" }]
}
// Secret: wrangler secret put BETTER_AUTH_SECRET  (openssl rand -base64 32)`,
    notes:
      '`run_worker_first: ["/api/*"]` is mandatory — otherwise the greedy asset binding serves index.html for /api/auth/* and the edge caches it, replaying one user\'s session response to everyone.',
  },
  'sdk-client': {
    title: '@flarelink/client — talk to a hosted Flarelink auth Worker',
    when: 'When a separate Flarelink-provisioned auth Worker holds auth/storage/db (not the self-contained shape).',
    code: `import { createFlarelink } from '@flarelink/client';

// Browser / non-CF server: HTTP transport. serviceKey is SERVER-ONLY.
const flarelink = createFlarelink({ url: env.FLARELINK_URL, serviceKey: env.FLARELINK_SERVICE_KEY });

// On Cloudflare you can pass the D1 binding so db calls run natively (no hop):
const flarelink = createFlarelink({ url, serviceKey, d1: env.DB });

await flarelink.auth.getMe();                       // { id, email, name } | null
await flarelink.from('notes').where({ user_id: id }).select();
await flarelink.storage.from('bucket').createSignedUploadUrl(key);`,
    notes:
      'NEVER ship the serviceKey to the browser. See flarelink_sdk_reference for the full surface and return shapes.',
  },
};

export const SDK_REFERENCE: Record<'auth' | 'storage' | 'db', string> = {
  auth: `## flarelink.auth.* (browser + server)
- signUp(name, email, password) -> { user }
- signIn(email, password) -> { user }
- signInWithSocial(provider, { callbackURL? })
- signInWithMagicLink(email, { callbackURL? })  // first arg is the email string
- signOut()
- getMe() -> User | null   // { id, email, name, ... } — use this for "current user"
- getSession() -> Session | null  // { userId, expiresAt, ... } — NO nested user
- requestPasswordReset(email) / resetPassword({ token, newPassword }) -> { status }
- sendVerificationEmail({ email, callbackURL? })
Errors throw AuthError with a machine-readable .code.`,
  storage: `## flarelink.storage.* (server-only — needs serviceKey)
- storage.from(bucket).createSignedUploadUrl(key, opts) -> { url, signedHeaders }
- storage.from(bucket).createSignedDownloadUrl(key, opts) -> { url }
- storage.from(bucket).remove(keys) / .list({ prefix, cursor })
- storage.listBuckets()
The browser PUTs to { url } with EXACTLY { signedHeaders } (usually content-type).
Errors throw StorageError with .code (INVALID_SERVICE_KEY / R2_NOT_CONFIGURED / ...).`,
  db: `## flarelink.from(...) / flarelink.sql (server-only — needs serviceKey, or the d1 binding)
- from(table).select(...).where({ col: val }).orderBy(col).limit(n).offset(n)
- from(table).insert(row | rows).returning('*')
- from(table).update(patch).where({...}).returning('*')
- from(table).delete().where({...})
- flarelink.sql\`SELECT * FROM notes WHERE id = \${id}\`  // values become bound params
Equality + AND only in where(); use flarelink.sql for IN / OR / ranges / joins.
Identifiers are validated; values are always bound. Errors throw DatabaseError with .code.`,
};

// Static cost-optimization PATTERNS (coaching), grounded in the product brief.
// NOTE: this is design guidance, not a live usage/cost meter.
export const COST_PATTERNS = `# Cloudflare cost-optimization patterns (design guidance)

These keep a Cloudflare bill near zero. Apply them as you build — this is
guidance, not a live usage meter.

1. **Sessions in KV, not D1.** D1 bills per row read and the auth check runs on
   every authenticated request. KV reads are edge-cached and ~free at this scale.
2. **Cache API in front of hot reads.** For list/public endpoints, \`caches.default\`
   removes 95%+ of D1 hits. Cache the Response with \`s-maxage\`, serve on hit.
3. **R2 presigned URLs, never proxy.** Don't stream file bytes through the Worker
   (burns requests + CPU). Hand the client a presigned URL and let it hit R2 directly.
4. **Batch D1, kill N+1.** Replace a per-id loop of \`.first()\` with one
   \`WHERE id IN (?, ?, ...)\` + \`.all()\`, or \`env.DB.batch([...])\`.
5. **Don't poll — use Queues or Durable Object alarms.** Polling "is it done yet?"
   every 2s is ~1,800 requests/hour per job. Push completion instead.
6. **Right primitive for the data shape:** sessions/tokens/flags -> KV;
   relational data -> D1; files -> R2; per-room realtime state -> Durable Objects;
   background jobs -> Queues; embeddings -> Vectorize.

A red flag worth surfacing to the developer: a \`sessions\` table in D1 (move it
to KV), or downloads served via \`env.BUCKET.get(...)\` returned through the Worker
(switch to presigned).`;

export const PATTERN_KEYS = Object.keys(PATTERNS);
