# Publishing to VS Code Marketplace

Publisher: **ricardodiaz**
Extension ID: `ricardodiaz.pq-sync`

## Pre-requisites

- Node ≥ 18, `@vscode/vsce` already in devDependencies (no global install needed)
- Azure DevOps PAT with scope **Marketplace → Manage** (see step 0)

## Step 0 — Get / renew PAT

1. Go to https://aex.dev.azure.com → select organization **ofizdev.visualstudio.com** (Owner) — takes you to https://ofizdev.visualstudio.com/
2. Top-right avatar **User Settings** → **Personal Access Tokens**
3. New token — name anything, org: **All accessible organizations**
4. Custom scope → **Marketplace → Manage**
5. Copy the token (shown once)

## Step 1 — Bump version

Edit `package.json` and `package-lock.json` — update `"version"` to the new semver.

```
npm version patch   # or minor / major
```

This also creates a local git tag. Push it separately after publishing.

## Step 2 — Update CHANGELOG.md

Add a new `## [X.Y.Z] - YYYY-MM-DD` section at the top with the release notes.

## Step 3 — Run tests & build

```
npm test
npm run build
```

Fix any failures before continuing.

## Step 4 — Package

```
npm run package
```

Produces `pq-sync-X.Y.Z.vsix` in the repo root.

## Step 5 — Publish

```
npx vsce publish --pat <YOUR_PAT> --packagePath pq-sync-X.Y.Z.vsix
```

Or publish directly (packages automatically):

```
npx vsce publish --pat <YOUR_PAT>
```

Verify at: https://marketplace.visualstudio.com/items?itemName=ricardodiaz.pq-sync

## Step 6 — Commit & tag

```
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: bump to vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

## Troubleshooting

| Error | Fix |
|---|---|
| `401 Unauthorized` | PAT expired — generate new one (Step 0) |
| `Version already exists` | Marketplace already has this version — bump again |
| `Missing field: repository` | `package.json` must have a `repository` field |
| Build fails with stale `.js` | Delete `scripts/*.js` — compiled artifacts shadow `.ts` source |
