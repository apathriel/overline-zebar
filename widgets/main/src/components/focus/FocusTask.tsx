import { useWidgetSetting } from '@overline-zebar/config';
import { chipStyles } from '@overline-zebar/ui';
import { Folder, Tag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { shellExec } from 'zebar';
import { cn } from '../../utils/cn';

const POLL_INTERVAL_MS = 120_000; // 30 req/hour limit → 1 per 2 min max

interface TogglEntry {
  description: string | null;
  startedAt: number; // ms since epoch
  tags: string[];
  projectId: number | null;
  workspaceId: number | null;
}

interface TogglProject {
  name: string;
  color: string;
}

async function fetchTogglCurrent(apiKey: string): Promise<TogglEntry | null> {
  const creds = btoa(`${apiKey}:api_token`);
  const result = await shellExec('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `try { $r = Invoke-RestMethod -Uri 'https://api.track.toggl.com/api/v9/me/time_entries/current' -Headers @{Authorization='Basic ${creds}'} -ErrorAction Stop; if ($r) { $r | ConvertTo-Json -Compress } else { 'null' } } catch { 'null' }`,
  ]);
  const output = result.stdout.trim();
  if (!output || output === 'null') return null;
  const data = JSON.parse(output);
  if (!data || typeof data !== 'object') return null;
  if (data.stop != null) return null;
  const startedAt = new Date(data.start).getTime();
  if (isNaN(startedAt)) return null;
  return {
    description: data.description || null,
    startedAt,
    tags: Array.isArray(data.tags) ? data.tags : [],
    projectId: data.project_id ?? null,
    workspaceId: data.workspace_id ?? null,
  };
}

async function fetchTogglProject(
  apiKey: string,
  workspaceId: number,
  projectId: number,
): Promise<TogglProject | null> {
  const creds = btoa(`${apiKey}:api_token`);
  const result = await shellExec('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `try { $r = Invoke-RestMethod -Uri 'https://api.track.toggl.com/api/v9/workspaces/${workspaceId}/projects/${projectId}' -Headers @{Authorization='Basic ${creds}'} -ErrorAction Stop; if ($r) { $r | ConvertTo-Json -Compress } else { 'null' } } catch { 'null' }`,
  ]);
  const output = result.stdout.trim();
  if (!output || output === 'null') return null;
  const data = JSON.parse(output);
  if (!data || !data.name) return null;
  return { name: data.name, color: data.color ?? '#888888' };
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
  const [projectCache, setProjectCache] = useState<Record<number, TogglProject>>({});

  // Toggl API token from config (synced across widgets via Tauri IPC)
  const [togglApiKey] = useWidgetSetting('main', 'togglApiKey');

  // UI
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [projectExpanded, setProjectExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
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

  // ── Project fetch (cached by project_id) ──────────────────────────
  useEffect(() => {
    const pid = togglEntry?.projectId;
    const wsId = togglEntry?.workspaceId;
    if (!pid || !wsId || !togglApiKey || projectCache[pid]) return;
    fetchTogglProject(togglApiKey, wsId, pid)
      .then(proj => {
        if (proj) setProjectCache(c => ({ ...c, [pid]: proj }));
      })
      .catch(() => {});
  }, [togglEntry?.projectId, togglApiKey]);

  // ── Collapse chips when entry changes ─────────────────────────────
  useEffect(() => {
    setProjectExpanded(false);
    setTagsExpanded(false);
  }, [togglEntry?.projectId]);

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

  const handleClick = () => {
    if (editing) return;

    if (!hasManualTask) {
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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isTogglActive) return;
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

  const indicator = isTogglActive ? (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
    </span>
  ) : paused ? (
    <span className="text-text-muted shrink-0 leading-none text-[10px]">▶</span>
  ) : hasManualTask ? (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: '#8a5cf5' }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#8a5cf5' }} />
    </span>
  ) : null;

  const project = togglEntry?.projectId ? projectCache[togglEntry.projectId] : null;
  const hasTags = (togglEntry?.tags.length ?? 0) > 0;

  return (
    <div
      className={cn(
        chipStyles,
        'cursor-pointer gap-1.5 min-w-[4rem] max-w-[28rem]',
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

          {/* Project chip */}
          {isTogglActive && togglEntry!.projectId && (
            <button
              className="flex items-center gap-1 shrink-0 text-text-muted hover:text-text transition-colors duration-150"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setProjectExpanded(v => !v); }}
              onContextMenu={(e) => e.stopPropagation()}
            >
              <Folder className="h-3 w-3" />
              <span
                className="overflow-hidden whitespace-nowrap transition-all duration-200 ease-in-out flex items-center gap-1"
                style={{ maxWidth: projectExpanded ? '8rem' : '0px', opacity: projectExpanded ? 1 : 0 }}
              >
                {project && (
                  <>
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="text-text text-xs truncate">{project.name}</span>
                  </>
                )}
              </span>
            </button>
          )}

          {/* Tags chip */}
          {isTogglActive && hasTags && (
            <button
              className="flex items-center gap-1 shrink-0 text-text-muted hover:text-text transition-colors duration-150"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setTagsExpanded(v => !v); }}
              onContextMenu={(e) => e.stopPropagation()}
            >
              <Tag className="h-3 w-3" />
              <span
                className="overflow-hidden whitespace-nowrap transition-all duration-200 ease-in-out"
                style={{ maxWidth: tagsExpanded ? '10rem' : '0px', opacity: tagsExpanded ? 1 : 0 }}
              >
                <span className="text-text text-xs">{togglEntry!.tags.join(', ')}</span>
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
