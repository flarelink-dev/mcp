# Container image for the Flarelink MCP server (stdio transport).
# Used by Glama and anyone who wants to run the server in a sandbox: it builds
# the TypeScript, installs only production deps in the final image, and runs the
# server over stdio so MCP introspection works out of the box.

# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build

# --- runtime ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# stdio MCP server — no ports. FLARELINK_API_KEY is optional (management tools).
ENTRYPOINT ["node", "dist/index.js"]
