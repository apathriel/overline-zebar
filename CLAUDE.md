# overline-zebar — Project Context for Claude

This is a fork of [mushfikurr/overline-zebar](https://github.com/mushfikurr/overline-zebar), a Zebar
theme (Windows taskbar replacement). The deployed fork lives at `C:\Users\gabri\.glzr\zebar\overline-3`.

## Repo layout

```
overline-zebar-source/          ← this repo (source)
├── packages/
│   ├── config/                 ← Zod config schema, ConfigProvider, useWidgetSetting hook
│   │   └── src/
│   │       ├── zod-types.ts    ← MainWidgetSettingsSchema (add new settings here)
│   │       ├── defaults/
│   │       │   ├── default-config.ts
│   │       │   └── theme-presets.ts  ← autoTheme (empty colors = defer to CSS/OS)
│   │       ├── ConfigProvider.tsx    ← applies theme CSS vars; clears all vars for auto theme
│   │       └── ConfigService.tsx     ← localStorage + Tauri IPC broadcast; v1→v2 migration
│   ├── ui/                     ← shared Tailwind styles, chipStyles, component primitives
│   │   └── src/
│   │       ├── theme.css       ← oklch color vars, light/dark via @media + JS fallback
│   │       └── index.css       ← imports theme.css; built to dist/index.css
│   ├── tailwind/               ← shared Tailwind preset
│   └── typescript/             ← shared tsconfig
└── widgets/
    ├── main/                   ← topbar widget (React + Vite)
    │   ├── public/
    │   │   └── color-scheme-fallback.js  ← JS light/dark switcher for WebView2
    │   ├── index.html          ← loads color-scheme-fallback.js before module scripts
    │   ├── src/
    │   │   ├── App.tsx         ← provider group setup, layout (Left | Center | Right)
    │   │   ├── index.css       ← permanent bar border via #root > div selector
    │   │   └── components/
    │   │       ├── focus/
    │   │       │   └── FocusTask.tsx   ← THE CUSTOM WIDGET (see below)
    │   │       ├── systray/    ← chip-wrapped, 8 icons visible
    │   │       └── TimeDisplay.tsx     ← chip-wrapped clock
    └── config-widget/          ← settings window (React + Vite, opened from system tray)
        └── src/components/pages/widgets/main/
            ├── MainSettings.tsx        ← tabs: General, Time, Stats, Systray, Toggl
            └── components/
                └── TogglTab.tsx        ← API token input field
```

## Build & deploy workflow

**Always build in this order** (config is source-only, no build step):

```bash
cd C:/Users/gabri/dev/overline-zebar-source

# 1. UI package (produces dist/index.css consumed by widgets)
pnpm --filter @overline-zebar/ui build

# 2. Widget(s)
pnpm --filter main build
pnpm --filter config-widget build
pnpm --filter system-stats build

# 3. Deploy to overline-3
cp -r widgets/main/dist/. C:/Users/gabri/.glzr/zebar/overline-3/widgets/main/dist/
cp -r widgets/config-widget/dist/. C:/Users/gabri/.glzr/zebar/overline-3/widgets/config-widget/dist/
cp -r widgets/system-stats/dist/. C:/Users/gabri/.glzr/zebar/overline-3/widgets/system-stats/dist/
```

The Vite build script kills `zebar.exe` automatically — Zebar must be restarted manually after deploy.

## Key custom additions (our changes on top of upstream)

### FocusTask widget (`widgets/main/src/components/focus/FocusTask.tsx`)
- **Left click (idle):** refresh Toggl; **(with manual task):** pause/resume timer
- **Right click:** edit manual task inline (ephemeral, resets on reload)
- **Toggl integration:** polls `/api/v9/me/time_entries/current` every 2 minutes via `shellExec('powershell', ...)` — needed because WebView2 blocks cross-origin fetch (CORS) to Toggl's API
- **Auth format:** `base64(API_TOKEN:api_token)` — token as username, literal "api_token" as password
- **Project + tags:** folder icon and tag icon expand inline on click; project details cached by `project_id`
- **Indicators:** pulsing green dot (Toggl active), pulsing purple `#8a5cf5` dot (manual running), ▶ (paused)
- **Rate limit:** Toggl free plan = 30 req/hour on `/me` endpoints → 2-min interval; re-polls on `visibilitychange`

### Config system additions
- `togglApiKey` field in `MainWidgetSettingsSchema` (zod-types.ts + default-config.ts)
- Auto theme (`id: 'auto'`) with empty colors — `ConfigProvider` removes all CSS vars so OS light/dark takes effect
- v1→v2 migration in `ConfigService.tsx`: resets `currentThemeId: 'default'` → `'auto'`

### Visual tweaks
- `theme.css`: dynamic oklch colors, `@media (prefers-color-scheme: light)` palette
- `color-scheme-fallback.js`: JS fallback switcher for WebView2 (loaded before React)
- `index.css`: permanent border on `#root > div`
- Systray: wrapped in `chipStyles`, 8 icons visible (was 4)
- TimeDisplay: wrapped in `chipStyles`

### Shell permissions (`zpack.json` in overline-3)
The main widget has `privileges.shellCommands` allowing `powershell` with `argsRegex: ".*"`.
This is required for Toggl API calls via `shellExec`.

## Config system

Settings are stored in `localStorage` under `'overline-zebar-config'` and synced between widgets
via Tauri IPC event `'config-changed'`. Each widget has isolated localStorage; the event carries
the full config payload so all widgets stay in sync.

To add a new setting:
1. Add field to `MainWidgetSettingsSchema` in `packages/config/src/zod-types.ts`
2. Add default in `packages/config/src/defaults/default-config.ts`
3. Use `const [value, setValue] = useWidgetSetting('main', 'fieldName')` in any widget
4. Optionally add a UI control in `widgets/config-widget/src/components/pages/widgets/main/`

## Toggl API notes

- Endpoint: `GET https://api.track.toggl.com/api/v9/me/time_entries/current`
- Returns running entry (with `stop: null`) or JSON `null` when nothing is running
- Rate limit: 30 req/hour on `/me` endpoints (free, starter, premium) — effective Sep 2025
- Project details: `GET /api/v9/workspaces/{workspace_id}/projects/{project_id}` (cached)
- CORS blocks browser fetch from `http://127.0.0.1:6124` → use `shellExec` + PowerShell

## Worktree workflow

```bash
# Create
git worktree add -b feature/my-feature ../overline-zebar-my-feature

# Work, build, commit inside worktree
cd ../overline-zebar-my-feature
pnpm install --frozen-lockfile   # required — worktrees don't share node_modules
pnpm --filter @overline-zebar/ui build && pnpm --filter main build

# Merge back
cd ../overline-zebar-source
git merge feature/my-feature --no-ff
git branch -d feature/my-feature
# Delete worktree dir manually if git worktree remove fails (Zebar holds file handles)
```
