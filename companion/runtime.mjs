import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Control files contain process health only, never document text or credentials.
export function monitorHost(onStop, root = join(process.env.LOCALAPPDATA || '.', 'PaperLantern', 'runtime')) {
  mkdirSync(root, { recursive: true });
  const paused = join(root, 'paused'),
    epochFile = join(root, 'restart');
  const readEpoch = () => {
    try {
      return readFileSync(epochFile, 'utf8');
    } catch {
      return '';
    }
  };
  const epoch = readEpoch(),
    path = join(root, `host-${process.pid}.json`);
  let state = 'starting',
    models = 0,
    active = 0,
    stopped = false;
  const publish = () => {
    writeFileSync(
      path + '.tmp',
      JSON.stringify({ pid: process.pid, updatedAt: Date.now(), state, models, active }),
    );
    renameSync(path + '.tmp', path);
  };
  const blocked = () => existsSync(paused);
  const timer = setInterval(() => {
    if (stopped) return;
    if (blocked() || readEpoch() !== epoch) {
      stopped = true;
      onStop();
      return;
    }
    try {
      publish();
    } catch {
      /* Tray diagnostics must not interrupt reading. */
    }
  }, 1000);
  timer.unref();
  return {
    blocked,
    update(next = state, count = models, requests = active) {
      if (stopped) return;
      state = next;
      models = count;
      active = requests;
      try {
        publish();
      } catch {}
    },
    launchTray() {
      if (process.platform !== 'win32' || blocked()) return;
      const script = join(dirname(fileURLToPath(import.meta.url)), 'tray.ps1');
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script],
        { windowsHide: true, detached: true, stdio: 'ignore' },
      );
      child.on('error', () => {});
      child.unref();
    },
    close() {
      stopped = true;
      clearInterval(timer);
      rmSync(path, { force: true });
      rmSync(path + '.tmp', { force: true });
    },
  };
}
