import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  source: "local" | "spotify" | "ytmusic" | "demo";
  url: string;       // playable URL or blob URL for local
  artworkUrl?: string;
  durationSec?: number;
  addedAt: string;
}

export type Provider = "spotify" | "ytmusic";

interface MusicState {
  // Library
  tracks: MusicTrack[];
  // Playback
  currentId: string | null;
  isPlaying: boolean;
  volume: number; // 0..100
  repeat: boolean;
  shuffle: boolean;
  // Connections
  connections: Record<Provider, { connected: boolean; account?: string }>;

  // Library ops
  addTracks: (t: MusicTrack[]) => void;
  removeTrack: (id: string) => void;

  // Playback ops
  play: (id?: string) => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  setVolume: (v: number) => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;

  // Connection ops
  connect: (p: Provider, account: string) => void;
  disconnect: (p: Provider) => void;
}

const seed: MusicTrack[] = [
  {
    id: "demo-1",
    title: "Midnight Drive",
    artist: "SoundHelix",
    source: "demo",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    addedAt: new Date().toISOString(),
  },
  {
    id: "demo-2",
    title: "Velvet Pulse",
    artist: "SoundHelix",
    source: "demo",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    addedAt: new Date().toISOString(),
  },
  {
    id: "demo-3",
    title: "Sunset Loop",
    artist: "SoundHelix",
    source: "demo",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    addedAt: new Date().toISOString(),
  },
];

export const useMusicStore = create<MusicState>()(
  persist(
    (set, get) => ({
      tracks: seed,
      currentId: null,
      isPlaying: false,
      volume: 70,
      repeat: false,
      shuffle: false,
      connections: {
        spotify: { connected: false },
        ytmusic: { connected: false },
      },

      addTracks: (t) => set((s) => ({ tracks: [...t, ...s.tracks] })),
      removeTrack: (id) =>
        set((s) => ({
          tracks: s.tracks.filter((x) => x.id !== id),
          currentId: s.currentId === id ? null : s.currentId,
          isPlaying: s.currentId === id ? false : s.isPlaying,
        })),

      play: (id) => {
        const { tracks, currentId } = get();
        const targetId = id ?? currentId ?? tracks[0]?.id ?? null;
        if (!targetId) return;
        set({ currentId: targetId, isPlaying: true });
      },
      pause: () => set({ isPlaying: false }),
      toggle: () => {
        const { isPlaying, currentId, tracks } = get();
        if (!currentId && tracks[0]) {
          set({ currentId: tracks[0].id, isPlaying: true });
          return;
        }
        set({ isPlaying: !isPlaying });
      },
      next: () => {
        const { tracks, currentId, shuffle } = get();
        if (tracks.length === 0) return;
        if (shuffle) {
          const others = tracks.filter((t) => t.id !== currentId);
          const pick = others[Math.floor(Math.random() * others.length)] ?? tracks[0];
          set({ currentId: pick.id, isPlaying: true });
          return;
        }
        const i = tracks.findIndex((t) => t.id === currentId);
        const nxt = tracks[(i + 1) % tracks.length];
        set({ currentId: nxt.id, isPlaying: true });
      },
      prev: () => {
        const { tracks, currentId } = get();
        if (tracks.length === 0) return;
        const i = tracks.findIndex((t) => t.id === currentId);
        const prv = tracks[(i - 1 + tracks.length) % tracks.length];
        set({ currentId: prv.id, isPlaying: true });
      },
      setVolume: (v) => set({ volume: Math.max(0, Math.min(100, v)) }),
      toggleRepeat: () => set((s) => ({ repeat: !s.repeat })),
      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

      connect: (p, account) =>
        set((s) => ({
          connections: { ...s.connections, [p]: { connected: true, account } },
        })),
      disconnect: (p) =>
        set((s) => ({
          connections: { ...s.connections, [p]: { connected: false } },
        })),
    }),
    {
      name: "camel-music",
      // Don't persist blob URLs (they expire) or playback state
      partialize: (s) => ({
        tracks: s.tracks.filter((t) => t.source !== "local" || !t.url.startsWith("blob:")),
        volume: s.volume,
        repeat: s.repeat,
        shuffle: s.shuffle,
        connections: s.connections,
      }),
    }
  )
);