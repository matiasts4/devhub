import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  watchAntigravityTranscript,
  createTranscriptWatcherRegistry,
  resolveAntigravityTranscriptPath,
} from '../antigravityTranscriptWatcher.js';

describe('antigravityTranscriptWatcher', () => {
  let tmpDir;
  let transcriptPath;

  beforeEach(() => {
    jest.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-agy-transcript-'));
    transcriptPath = path.join(tmpDir, 'transcript.jsonl');
  });

  afterEach(() => {
    jest.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('resolveAntigravityTranscriptPath builds brain path', () => {
    const p = resolveAntigravityTranscriptPath('conv-1', '/home/u');
    expect(p).toBe(
      path.join(
        '/home/u',
        '.gemini',
        'antigravity-ide',
        'brain',
        'conv-1',
        '.system_generated',
        'logs',
        'transcript.jsonl'
      )
    );
  });

  test('throws without conversationId or transcriptPath', () => {
    expect(() => watchAntigravityTranscript({})).toThrow('conversationId or transcriptPath');
  });

  test('waits for file creation, then reports activity and idle', () => {
    const onActivity = jest.fn();
    const onIdle = jest.fn();

    const handle = watchAntigravityTranscript({
      transcriptPath,
      onActivity,
      onIdle,
      idleMs: 4000,
      pollMs: 1000,
    });

    // File does not exist yet — polls are silent.
    jest.advanceTimersByTime(3000);
    expect(onActivity).not.toHaveBeenCalled();
    expect(onIdle).not.toHaveBeenCalled();

    // Agent starts writing.
    fs.writeFileSync(transcriptPath, '{"role":"user"}\n');
    jest.advanceTimersByTime(1000);
    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(onActivity.mock.calls[0][0].size).toBe(16);

    // More growth resets the quiet window.
    fs.appendFileSync(transcriptPath, '{"role":"model"}\n');
    jest.advanceTimersByTime(1000);
    expect(onActivity).toHaveBeenCalledTimes(2);
    expect(onIdle).not.toHaveBeenCalled();

    // Quiet for ≥ idleMs → onIdle fires exactly once.
    jest.advanceTimersByTime(4000);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onIdle.mock.calls[0][0]).toMatchObject({ idleMs: 4000 });

    // Stays quiet — no duplicate idle.
    jest.advanceTimersByTime(6000);
    expect(onIdle).toHaveBeenCalledTimes(1);

    // New growth re-arms.
    fs.appendFileSync(transcriptPath, '{"role":"user"}\n');
    jest.advanceTimersByTime(1000);
    expect(onActivity).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(4000);
    expect(onIdle).toHaveBeenCalledTimes(2);

    handle.unwatch();
  });

  test('handles truncation/rotation as activity', () => {
    fs.writeFileSync(transcriptPath, 'x'.repeat(100));
    const onActivity = jest.fn();
    const onIdle = jest.fn();

    const handle = watchAntigravityTranscript({
      transcriptPath,
      onActivity,
      onIdle,
      idleMs: 4000,
      pollMs: 1000,
    });

    jest.advanceTimersByTime(1000); // first sighting (100 bytes = activity)
    expect(onActivity).toHaveBeenCalledTimes(1);

    fs.writeFileSync(transcriptPath, 'y'.repeat(10)); // rotation shrinks
    jest.advanceTimersByTime(1000);
    expect(onActivity).toHaveBeenCalledTimes(2);
    expect(onActivity.mock.calls[1][0].size).toBe(10);

    handle.unwatch();
  });

  test('unwatch stops polling (no callbacks after stop)', () => {
    const onActivity = jest.fn();
    const handle = watchAntigravityTranscript({
      transcriptPath,
      onActivity,
      pollMs: 1000,
    });

    handle.unwatch();
    fs.writeFileSync(transcriptPath, 'data\n');
    jest.advanceTimersByTime(10000);
    expect(onActivity).not.toHaveBeenCalled();
  });

  test('empty file at creation does not count as activity until growth', () => {
    fs.writeFileSync(transcriptPath, '');
    const onActivity = jest.fn();
    const onIdle = jest.fn();

    const handle = watchAntigravityTranscript({
      transcriptPath,
      onActivity,
      onIdle,
      idleMs: 4000,
      pollMs: 1000,
    });

    jest.advanceTimersByTime(2000);
    expect(onActivity).not.toHaveBeenCalled();
    expect(onIdle).not.toHaveBeenCalled(); // no activity yet → no idle

    fs.appendFileSync(transcriptPath, 'line\n');
    jest.advanceTimersByTime(1000);
    expect(onActivity).toHaveBeenCalledTimes(1);

    handle.unwatch();
  });

  describe('createTranscriptWatcherRegistry', () => {
    test('watch/unwatch/unwatchAll lifecycle', () => {
      const registry = createTranscriptWatcherRegistry();
      const p1 = path.join(tmpDir, 'a.jsonl');
      const p2 = path.join(tmpDir, 'b.jsonl');

      registry.watch('conv-a', { transcriptPath: p1, pollMs: 1000 });
      registry.watch('conv-b', { transcriptPath: p2, pollMs: 1000 });
      expect(registry.size()).toBe(2);
      expect(registry.has('conv-a')).toBe(true);

      // Re-watch replaces (no duplicate timers).
      registry.watch('conv-a', { transcriptPath: p1, pollMs: 1000 });
      expect(registry.size()).toBe(2);

      registry.unwatch('conv-a');
      expect(registry.size()).toBe(1);

      registry.unwatchAll();
      expect(registry.size()).toBe(0);
    });
  });
});
