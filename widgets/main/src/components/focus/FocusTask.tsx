import { useWidgetSetting } from '@overline-zebar/config';
import { chipStyles } from '@overline-zebar/ui';
import { useEffect, useRef, useState } from 'react';
import { shellExec } from 'zebar';
import { cn } from '../../utils/cn';

const POLL_INTERVAL_MS = 120_000; // 30 req/hour limit → 1 per 2 min max

interface TogglEntry {
  description: string | null;
  startedAt: number; // ms since epoch
}

async function fetchTogglCurrent(apiKey: string): Promise<TogglEntry | null> {
  // Toggl API token auth: base64(token:api_token)
  const creds = btoa(`${apiKey}:api_token`);
  // Use shellExec to bypass WebView2 CORS restrictions — runs via Rust backend
  const result = await shellExec('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `try { $r = Invoke-RestMethod -Uri 'https://api.track.toggl.com/api/v9/me/time_entries/current' -Headers @{Authorization='Basic ${creds}'} -ErrorAction Stop; if ($r) { $r | ConvertTo-Json -Compress } else { 'null' } } catch { 'null' }`,
  ]);
  const output = result.stdout.trim();
  if (!output || output === 'null') return null;
  const data = JSON.parse(output);
  if (!data) return null;
  return {
    description: data.description || null,
    startedAt: new Date(data.start).getTime(),
  };
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function FocusTask() {
  // Manual task (ephemeral — resets on reload)
  const [localTask, setLocalTask] = useState('');
  const [timerBase, setTimerBase] = useState<number | null>(null);
  const [accumulated, setAccumulated] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manualElapsed, setManualElapsed] = useState(0);

  // Toggl
  const [togglEntry, setTogglEntry] = useState<TogglEntry | null>(null);
  const [togglElapsed, setTogglElapsed] = useState(0);

  // Toggl API token from config (synced across widgets via Tauri IPC)
  const [togglApiKey] = useWidgetSetting('main', 'togglApiKey');

  // UI — only mode remaining is edit-task (right-click)
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Toggl polling ─────────────────────────────────────────────────
  useEffect(() => {
    if (!togglApiKey) return;

    const poll = () =>
      fetchTogglCurrent(togglApiKey)
        .then(setTogglEntry)
        .catch(() => {});

    poll();
    let id = setInterval(poll, POLL_INTERVAL_MS);

    // Re-sync immediately when the machine wakes or the tab becomes visible
    // (e.g. after sleep), then restart the interval from that point.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearInterval(id);
        poll();
        id = setInterval(poll, POLL_INTERVAL_MS);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [togglApiKey]);

  // ── Toggl elapsed ticker ──────────────────────────────────────────
  useEffect(() => {
    if (!togglEntry) { setTogglElapsed(0); return; }
    const tick = () => setTogglElapsed(Date.now() - togglEntry.startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [togglEntry]);

  // ── Manual elapsed ticker ─────────────────────────────────────────
  useEffect(() => {
    if (!timerBase || paused) return;
    const tick = () => setManualElapsed(accumulated + (Date.now() - timerBase));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerBase, paused, accumulated]);

  // ── Focus input when entering edit mode ───────────────────────────
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // ── Derived state ─────────────────────────────────────────────────
  const isTogglActive = togglEntry !== null;
  const hasManualTask = localTask !== '';

  // Left click: pause/resume manual timer; if no task, manually refresh Toggl
  const handleClick = () => {
    if (editing) return;

    if (!hasManualTask) {
      // Nothing tracked locally — use click as a manual Toggl refresh
      if (togglApiKey) {
        fetchTogglCurrent(togglApiKey)
          .then(setTogglEntry)
          .catch(() => {});
      }
      return;
    }

    if (isTogglActive) return;

    if (paused) {
      setTimerBase(Date.now());
      setPaused(false);
    } else {
      setAccumulated((a) => a + (Date.now() - (timerBase ?? Date.now())));
      setTimerBase(null);
      setPaused(true);
    }
  };

  // Right click: open inline task editor
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isTogglActive) return; // Toggl owns the display — nothing to edit
    setInputValue(localTask);
    setEditing(true);
  };

  const commit = () => {
    const val = inputValue.trim();
    setLocalTask(val);
    if (val) {
      setAccumulated(0);
      setTimerBase(Date.now());
      setManualElapsed(0);
      setPaused(false);
    } else {
      // Cleared the task — stop timer
      setTimerBase(null);
      setAccumulated(0);
      setManualElapsed(0);
      setPaused(false);
    }
    setEditing(false);
    setInputValue('');
  };

  const cancel = () => {
    setEditing(false);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  };

  // ── Render ────────────────────────────────────────────────────────
  const displayTask = isTogglActive
    ? (togglEntry!.description ?? 'timer running')
    : localTask;

  const displayElapsed = isTogglActive ? togglElapsed : manualElapsed;
  const showTimer = (isTogglActive || hasManualTask) && !editing;

  // Status indicator
  const indicator = isTogglActive ? (
    // Toggl active: pulsing green ring dot
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
    </span>
  ) : paused ? (
    <span className="text-text-muted shrink-0 leading-none text-[10px]">▶</span>
  ) : hasManualTask ? (
    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
  ) : null;

  return (
    <div
      className={cn(
        chipStyles,
        'cursor-pointer gap-1.5 min-w-[4rem] max-w-[20rem]',
        editing && 'border-button-border/60',
        paused && !isTogglActive && 'opacity-60',
      )}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {!editing && indicator}

      {editing ? (
        <input
          ref={inputRef}
          className="bg-transparent outline-none w-full text-text placeholder:text-text-muted"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={cancel}
          onKeyDown={handleKeyDown}
          placeholder="working on..."
        />
      ) : (
        <>
          <span className={cn('truncate', displayTask ? 'text-text' : 'text-text-muted')}>
            {displayTask || 'Focus...'}
          </span>
          {showTimer && (
            <span className="text-text-muted shrink-0 tabular-nums">
              {formatElapsed(displayElapsed)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
