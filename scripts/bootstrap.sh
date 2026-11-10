#!/usr/bin/env bash
# Haul infrastructure bootstrap.
# Creates folder structure, workspace config, package manifests, tsconfigs,
# env template, then installs dependencies. Safe to re-run: existing files are kept.
set -euo pipefail

ROOT="${1:-.}"
mkdir -p "$ROOT"
cd "$ROOT"

write() { # write <path> only if missing; content from stdin
  local path="$1"
  if [[ -e "$path" ]]; then echo "skip  $path"; cat >/dev/null; return; fi
  mkdir -p "$(dirname "$path")"
  cat >"$path"
  echo "write $path"
}

# ---------- folders ----------
mkdir -p apps/api/src/{routes,lib} apps/web/app \
  packages/{core,units,recipe-parser,retailers,resolver,db}/src \
  packages/db/prisma eval/{recipes,labels,runs} scripts

# ---------- root ----------
write package.json <<'EOF'
{
  "name": "haul",
  "private": true,
  "packageManager": "pnpm@10.28.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "db:generate": "pnpm --filter @haul/db exec prisma generate",
    "db:migrate": "pnpm --filter @haul/db exec prisma migrate dev",
    "eval": "pnpm --filter @haul/eval eval"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "prettier": "^3.4.0",
    "tsx": "^4.19.0",
    "turbo": "^2.3.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
EOF

write pnpm-workspace.yaml <<'EOF'
packages:
  - "apps/*"
  - "packages/*"
  - "eval"
onlyBuiltDependencies:
  - "@prisma/client"
  - "@prisma/engines"
  - prisma
  - esbuild
EOF

write turbo.json <<'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "typecheck": { "dependsOn": ["^typecheck"] },
    "test": {},
    "lint": {},
    "dev": { "cache": false, "persistent": true }
  }
}
EOF

write tsconfig.base.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": false,
    "noEmit": true
  }
}
EOF

write .gitignore <<'EOF'
node_modules/
dist/
.next/
.turbo/
coverage/
.env
.env.*
!.env.example
eval/runs/*
!eval/runs/.gitkeep
*.log
.DS_Store
EOF
touch eval/runs/.gitkeep

write .nvmrc <<'EOF'
22
EOF

write .editorconfig <<'EOF'
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
EOF

write .prettierrc <<'EOF'
{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all" }
EOF

write .env.example <<'EOF'
# --- Runtime ---
NODE_ENV=development
API_PORT=4000
WEB_ORIGIN=http://localhost:3000
API_PUBLIC_URL=http://localhost:4000

# --- Security ---
# 32-byte key, base64. Generate: openssl rand -base64 32
TOKEN_ENCRYPTION_KEY=
# Cookie signing secret. Generate: openssl rand -base64 48
SESSION_SECRET=

# --- Database (Railway Postgres in prod) ---
DATABASE_URL=postgresql://haul:haul@localhost:5432/haul

# --- Kroger (developer.kroger.com) ---
KROGER_CLIENT_ID=
KROGER_CLIENT_SECRET=
KROGER_REDIRECT_URI=http://localhost:4000/auth/kroger/callback
KROGER_API_BASE=https://api.kroger.com/v1

# --- Instacart Developer Platform ---
INSTACART_API_KEY=
INSTACART_API_BASE=https://connect.dev.instacart.tools
INSTACART_LINKBACK_URL=http://localhost:3000

# --- LLM rerank (optional; deterministic scorer runs without it) ---
ANTHROPIC_API_KEY=
RERANK_MODEL=claude-haiku-5-5
EOF

# ---------- shared package helper ----------
pkg() { # pkg <dir> <name> <deps-json> <devdeps-json>
  local dir="$1" name="$2" deps="$3" dev="$4"
  write "$dir/package.json" <<EOF
{
  "name": "$name",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": $deps,
  "devDependencies": $dev
}
EOF
  write "$dir/tsconfig.json" <<'EOF'
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src"] }
EOF
}

pkg packages/core          @haul/core          '{ "zod": "^3.24.0" }' '{}'
pkg packages/units         @haul/units         '{ "@haul/core": "workspace:*" }' '{}'
pkg packages/recipe-parser @haul/recipe-parser '{ "@haul/core": "workspace:*", "@haul/units": "workspace:*", "node-html-parser": "^7.0.0" }' '{}'
pkg packages/retailers     @haul/retailers     '{ "@haul/core": "workspace:*", "zod": "^3.24.0" }' '{}'
pkg packages/resolver      @haul/resolver      '{ "@haul/core": "workspace:*", "@haul/units": "workspace:*", "@haul/retailers": "workspace:*", "@haul/recipe-parser": "workspace:*", "zod": "^3.24.0" }' '{}'

# resolver also exports its sample catalog for tests and the offline eval
sed -i.bak 's#"exports": { ".": "./src/index.ts" }#"exports": { ".": "./src/index.ts", "./fixtures": "./src/fixtures.ts" }#' packages/resolver/package.json
rm -f packages/resolver/package.json.bak

# db package has its own scripts
write packages/db/package.json <<'EOF'
{
  "name": "@haul/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "prisma generate >/dev/null && tsc -p tsconfig.json",
    "postinstall": "prisma generate || true"
  },
  "dependencies": { "@prisma/client": "^6.2.0" },
  "devDependencies": { "prisma": "^6.2.0" }
}
EOF
write packages/db/tsconfig.json <<'EOF'
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src"] }
EOF

# ---------- eval ----------
write eval/package.json <<'EOF'
{
  "name": "@haul/eval",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "eval": "tsx --env-file-if-exists=../.env run.ts" },
  "dependencies": {
    "@haul/core": "workspace:*",
    "@haul/recipe-parser": "workspace:*",
    "@haul/resolver": "workspace:*",
    "@haul/retailers": "workspace:*"
  }
}
EOF

# ---------- local Postgres ----------
write docker-compose.yml <<'EOF'
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: haul
      POSTGRES_PASSWORD: haul
      POSTGRES_DB: haul
    ports: ["5432:5432"]
    volumes: [haul-db:/var/lib/postgresql/data]
volumes:
  haul-db:
EOF

# ---------- CI ----------
write .github/workflows/ci.yml <<'EOF'
name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm eval
EOF

# ---------- apps/api ----------
write apps/api/package.json <<'EOF'
{
  "name": "@haul/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file=../../.env src/server.ts",
    "build": "tsup src/server.ts --format esm --target node22 --out-dir dist --clean",
    "start": "node dist/server.js",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@fastify/cookie": "^11.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/helmet": "^13.0.0",
    "@fastify/rate-limit": "^10.2.0",
    "@haul/core": "workspace:*",
    "@haul/db": "workspace:*",
    "@haul/recipe-parser": "workspace:*",
    "@haul/resolver": "workspace:*",
    "@haul/retailers": "workspace:*",
    "@haul/units": "workspace:*",
    "fastify": "^5.2.0",
    "zod": "^3.24.0"
  },
  "devDependencies": { "tsup": "^8.3.0" }
}
EOF
write apps/api/tsconfig.json <<'EOF'
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src"] }
EOF

# ---------- apps/web ----------
write apps/web/package.json <<'EOF'
{
  "name": "@haul/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@haul/core": "workspace:*",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": { "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" }
}
EOF
write apps/web/tsconfig.json <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "ES2023"],
    "jsx": "preserve",
    "allowJs": false,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "app", ".next/types/**/*.ts"]
}
EOF
write apps/web/next.config.mjs <<'EOF'
/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@haul/core'],
  poweredByHeader: false,
};
EOF
write apps/web/next-env.d.ts <<'EOF'
/// <reference types="next" />
/// <reference types="next/image-types/global" />
EOF

# ---------- env + install ----------
[[ -f .env ]] || { cp .env.example .env; echo "write .env (fill in secrets)"; }

if command -v pnpm >/dev/null; then
  pnpm install
else
  echo "pnpm not found: run 'corepack enable' then 'pnpm install'"
fi

echo
echo "Done. Next: fill .env, start Postgres, run 'pnpm db:migrate', then 'pnpm dev'."
