# Build & Release

## Automatic (GitHub Actions)

The recommended way to release. Push a version tag and GitHub builds for all 3 platforms:

```bash
# 1. Update version in package.json
# 2. Commit and push
git add package.json
git commit -m "v1.1.0"
git push origin main

# 3. Create and push tag
git tag v1.1.0
git push origin v1.1.0
```

GitHub Actions will:
1. Run 3 parallel jobs (Windows, macOS, Linux)
2. Build the app on each platform
3. Upload installers to GitHub Releases as `v1.1.0`

**Output per platform:**

| Platform | Files |
|----------|-------|
| Windows  | `.exe` installer (NSIS) + portable `.exe` |
| macOS    | `.dmg` (x64 + arm64) |
| Linux    | `.AppImage` + `.deb` |

### Prerequisites

Add your GitHub token as a repository secret:

1. GitHub → Repository → Settings → Secrets and variables → Actions
2. New repository secret: `GH_TOKEN` = your GitHub Personal Access Token (with `repo` scope)

## Manual (Local Build)

Build for a specific platform from your machine:

```bash
# Install dependencies
npm install

# Build the app
npm run build

# Build installer for current platform
npx electron-builder --win --publish always     # Windows
npx electron-builder --mac --publish always     # macOS (requires macOS)
npx electron-builder --linux --publish always   # Linux
```

The `--publish always` flag uploads to GitHub Releases. Without it, installers are saved to `release/` locally.

**Token for local builds:**

```bash
# Windows PowerShell
$env:GH_TOKEN="ghp_your_token_here"

# macOS / Linux
export GH_TOKEN="ghp_your_token_here"
```

## Auto-Update Flow

Once a Release exists on GitHub:

1. Installed apps check for updates on startup (5s delay) and every 30 minutes
2. Updates download automatically in the background
3. On next app quit, the update installs silently
4. The app restarts with the new version

No user interaction needed — fully automatic.

## Version Convention

Use semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR** — Breaking changes
- **MINOR** — New features
- **PATCH** — Bug fixes
