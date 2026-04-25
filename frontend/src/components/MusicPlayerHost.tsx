import { useEffect, useRef } from "react";
import { useMusicStore } from "@/stores/musicStore";

/**
 * Singleton hidden audio element that drives global playback.
 * Mounted once at the app root so playback continues across views.
 */
export function MusicPlayerHost() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { tracks, currentId, isPlaying, volume } = useMusicStore();

  // Init element once
  useEffect(() => {
    const a = new Audio();
    a.preload = "metadata";
    a.crossOrigin = "anonymous";
    audioRef.current = a;
    const onEnd = () => useMusicStore.getState().next();
    a.addEventListener("ended", onEnd);
    return () => {
      a.pause();
      a.removeEventListener("ended", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Source change
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const track = tracks.find((t) => t.id === currentId);
    if (!track) {
      a.pause();
      a.removeAttribute("src");
      return;
    }
    if (a.src !== track.url) {
      a.src = track.url;
      a.load();
    }
    if (isPlaying) a.play().catch(() => useMusicStore.setState({ isPlaying: false }));
  }, [currentId, tracks]);

  // Play/pause
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) a.play().catch(() => useMusicStore.setState({ isPlaying: false }));
    else a.pause();
  }, [isPlaying]);

  // Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  return null;
}