# GitHub Actions CI/CD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** CI pipeline that runs unit/integration tests, e2e tests, and builds+pushes a production Docker image to GHCR.

**Architecture:** Three parallel-then-gated jobs: `test` and `e2e` run in parallel, `docker` runs only after both pass and only on `main`. Production Dockerfile uses `oven/bun` base image with CSS build step.

**Tech Stack:** GitHub Actions, Docker, GHCR, Bun, Playwright

---

### Task 1: Create production Dockerfile

**Files:**
- Create: `Dockerfile`

**Step 1: Write the Dockerfile**

```dockerfile
FROM oven/bun:latest AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY tsconfig.json ./

RUN bunx @tailwindcss/cli -i src/web/styles/app.css -o src/web/styles/dist/app.css --minify

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "src/web/index.ts"]
```

**Step 2: Verify it builds locally**

Run: `docker build -t csf:test .`
Expected: Successful build

**Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat: add production Dockerfile"
```

---

### Task 2: Create GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create the workflow file**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun test

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - run: bunx @tailwindcss/cli -i src/web/styles/app.css -o src/web/styles/dist/app.css --minify
      - run: bun src/web/seed.ts
      - name: Start server
        run: bun src/web/index.ts &
        env:
          ALTCHA_HMAC_KEY: test-hmac-key
      - name: Wait for server
        run: |
          for i in $(seq 1 30); do
            curl -s http://localhost:3000/login && break
            sleep 1
          done
      - run: bunx playwright test

  docker:
    needs: [test, e2e]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: add CI workflow with tests, e2e, and Docker push"
```

---

### Task 3: Verify and push

**Step 1: Run lint**

Run: `bunx biome check --write`

**Step 2: Run tests locally**

Run: `bun test`
Expected: All pass

**Step 3: Push and verify**

Run: `git push`
Expected: GitHub Actions pipeline triggers
