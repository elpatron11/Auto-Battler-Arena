import { useEffect, useState } from 'react';
import { getGetArenaRecordingUrl } from '@workspace/api-client-react';

type Frame = [number, string];
type Replay = { version: 1; durationMs: number; frames: Frame[] };

function isReplay(value: unknown): value is Replay {
  if (!value || typeof value !== 'object') return false;
  const replay = value as Partial<Replay>;
  return replay.version === 1 && typeof replay.durationMs === 'number' &&
    Number.isFinite(replay.durationMs) && replay.durationMs >= 0 &&
    Array.isArray(replay.frames) && replay.frames.length > 0 &&
    replay.frames.every(frame => Array.isArray(frame) && frame.length === 2 &&
      typeof frame[0] === 'number' && frame[0] >= 0 && frame[0] <= replay.durationMs! &&
      typeof frame[1] === 'string' && frame[1].startsWith('data:image/jpeg;base64,'));
}

function clock(ms: number) {
  return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
}

export function SnapshotReplay({ id, opponentName }: { id: string; opponentName: string }) {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [error, setError] = useState('');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setReplay(null); setTime(0); setPlaying(false); setError('');
    void (async () => {
      try {
        const response = await fetch(getGetArenaRecordingUrl(id), { signal: controller.signal });
        if (!response.ok) throw new Error('Replay is unavailable.');
        const text = await response.text();
        if (text.length > 6_000_000) throw new Error('Replay is too large.');
        const data: unknown = JSON.parse(text);
        if (!isReplay(data)) throw new Error('Replay format is invalid.');
        if (!controller.signal.aborted) setReplay(data);
      } catch {
        if (!controller.signal.aborted) setError('Could not load this replay. Please try reopening the match.');
      }
    })();
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (!playing || !replay) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      setTime(current => {
        if (current + elapsed >= replay.durationMs) {
          setPlaying(false);
          return replay.durationMs;
        }
        return current + elapsed;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, replay]);

  if (error) return <p className="muted" role="alert">{error}</p>;
  if (!replay) return <p className="muted">Loading snapshot replay…</p>;
  // The frames are ordered by capture time; seek to the most recent captured image.
  let low = 0, high = replay.frames.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (replay.frames[middle][0] <= time) low = middle;
    else high = middle - 1;
  }
  return <div className="snapshot-player">
    <img src={replay.frames[low][1]} alt={`Fight against ${opponentName} at ${clock(time)}`} />
    <div className="snapshot-controls">
      <button type="button" onClick={() => { if (time >= replay.durationMs) setTime(0); setPlaying(value => !value); }}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <input type="range" min={0} max={Math.max(1, replay.durationMs)} step={100}
        value={time} onChange={event => { setTime(Number(event.target.value)); setPlaying(false); }}
        aria-label="Seek replay" />
      <span>{clock(time)} / {clock(replay.durationMs)}</span>
    </div>
    <p className="muted">Snapshot replay · captured frames, not video</p>
  </div>;
}