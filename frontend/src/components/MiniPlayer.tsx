import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipForward, Music2 } from "lucide-react";
import { useMusicStore } from "@/stores/musicStore";
import { cn } from "@/lib/utils";

/**
 * Apple Music iOS 15 style floating pill — appears above the editor when a track is loaded.
 * Click expands to controls; idle shows artwork + marquee title + animated wave.
 */
export function MiniPlayer({ className }: { className?: string }) {
  const { tracks, currentId, isPlaying, toggle, next } = useMusicStore();
  const track = tracks.find((t) => t.id === currentId);

  return (
    <AnimatePresence>
      {track && (
        <motion.div
          key="mini-player"
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className={cn(
            "pointer-events-auto inline-flex items-center gap-2 pl-1.5 pr-2 py-1.5",
            "rounded-full bg-card/85 backdrop-blur-xl border border-border shadow-lg",
            "max-w-[300px]",
            className
          )}
        >
          {/* Artwork — rotates while playing */}
          <motion.div
            className="relative h-8 w-8 rounded-full overflow-hidden bg-gradient-to-br from-primary/40 to-accent shrink-0 flex items-center justify-center"
            animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
            transition={
              isPlaying
                ? { duration: 6, ease: "linear", repeat: Infinity }
                : { duration: 0.4 }
            }
          >
            {track.artworkUrl ? (
              <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Music2 className="h-3.5 w-3.5 text-primary-foreground" />
            )}
            <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-foreground/10" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-card" />
          </motion.div>

          {/* Animated wave + marquee title */}
          <div className="flex items-center gap-2 min-w-0">
            <Wave playing={isPlaying} />
            <div className="overflow-hidden max-w-[140px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={track.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="text-meta font-medium text-foreground whitespace-nowrap"
                >
                  {/* Marquee scroll if long, otherwise static */}
                  {track.title.length > 18 ? (
                    <motion.span
                      className="inline-block"
                      animate={{ x: ["0%", "-50%"] }}
                      transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                    >
                      {track.title} · {track.artist} &nbsp;&nbsp;&nbsp; {track.title} · {track.artist} &nbsp;&nbsp;&nbsp;
                    </motion.span>
                  ) : (
                    <span>{track.title}</span>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-0.5 ml-1 shrink-0">
            <button
              onClick={toggle}
              className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center text-foreground transition-colors"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
            </button>
            <button
              onClick={next}
              className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center text-foreground transition-colors"
              aria-label="Next"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Wave({ playing }: { playing: boolean }) {
  const bars = [0, 1, 2, 3];
  return (
    <div className="flex items-end gap-[2px] h-4 w-5 shrink-0">
      {bars.map((b) => (
        <motion.span
          key={b}
          className="w-[2.5px] rounded-full bg-primary"
          animate={
            playing
              ? { height: ["25%", `${50 + ((b * 23) % 50)}%`, "25%"] }
              : { height: "25%" }
          }
          transition={
            playing
              ? { duration: 0.7 + b * 0.12, repeat: Infinity, ease: "easeInOut", delay: b * 0.08 }
              : { duration: 0.2 }
          }
        />
      ))}
    </div>
  );
}