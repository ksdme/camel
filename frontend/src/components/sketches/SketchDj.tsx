import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
const fredAgainIcon = "https://images.genius.com/52df19317ac31406e356ba7f330bd7f0.1000x1000x1.png";

const TRACKS = [
  { title: "Feisty", artist: "Fred again.." },
  { title: "Marea", artist: "Fred again.." },
  { title: "Delilah", artist: "Fred again.." },
  { title: "Bleu", artist: "Fred again.." },
  { title: "Angie", artist: "Fred again.." },
];

const draw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: (i: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { delay: i * 0.15, duration: 0.8, ease: "easeInOut" as const }, opacity: { delay: i * 0.15, duration: 0.01 } },
  }),
};

export function SketchDj() {
  const [trackIndex, setTrackIndex] = useState(0);
  const track = TRACKS[trackIndex];
  const prev = () => setTrackIndex((i) => (i - 1 + TRACKS.length) % TRACKS.length);
  const next = () => setTrackIndex((i) => (i + 1) % TRACKS.length);

  return (
    <div className="relative w-full h-full">
    <motion.svg
      viewBox="0 0 300 200"
      className="w-full h-full"
      initial="hidden"
      animate="show"
    >
      {/* ===== FULL DJ TABLE ===== */}
      <motion.rect x="5" y="30" width="290" height="160" rx="10" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" variants={draw} custom={0} />

      {/* ===== LEFT TURNTABLE ===== */}
      <motion.rect x="15" y="55" width="100" height="90" rx="6" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" strokeOpacity="0.4" variants={draw} custom={0.3} />
      {/* Platter */}
      <motion.circle cx="65" cy="105" r="32" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" variants={draw} custom={0.5} />
      {/* Spinning vinyl grooves */}
      <motion.g
        style={{ transformOrigin: "65px 105px" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear", delay: 1.5 }}
      >
        <motion.circle cx="65" cy="105" r="28" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" strokeOpacity="0.3" variants={draw} custom={0.7} />
        <motion.circle cx="65" cy="105" r="22" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" strokeOpacity="0.25" variants={draw} custom={0.8} />
        <motion.circle cx="65" cy="105" r="16" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" strokeOpacity="0.2" variants={draw} custom={0.9} />
        {/* Label area */}
        <motion.circle cx="65" cy="105" r="10" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" variants={draw} custom={1} />
        {/* Spindle */}
        <circle cx="65" cy="105" r="2" fill="hsl(var(--primary))" />
      </motion.g>
      {/* Left tone arm */}
      <motion.path d="M105 55 L105 45 L95 45" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" variants={draw} custom={1.5} />
      <motion.line x1="105" y1="55" x2="88" y2="78" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" variants={draw} custom={1.7} />

      {/* ===== RIGHT TURNTABLE ===== */}
      <motion.rect x="185" y="55" width="100" height="90" rx="6" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" strokeOpacity="0.4" variants={draw} custom={0.3} />
      {/* Platter */}
      <motion.circle cx="235" cy="105" r="32" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" variants={draw} custom={0.5} />
      {/* Spinning vinyl grooves */}
      <motion.g
        style={{ transformOrigin: "235px 105px" }}
        animate={{ rotate: -360 }}
        transition={{ duration: 5, repeat: Infinity, ease: "linear", delay: 1.8 }}
      >
        <motion.circle cx="235" cy="105" r="28" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" strokeOpacity="0.3" variants={draw} custom={0.7} />
        <motion.circle cx="235" cy="105" r="22" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" strokeOpacity="0.25" variants={draw} custom={0.8} />
        <motion.circle cx="235" cy="105" r="16" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" strokeOpacity="0.2" variants={draw} custom={0.9} />
        <motion.circle cx="235" cy="105" r="10" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" variants={draw} custom={1} />
        <circle cx="235" cy="105" r="2" fill="hsl(var(--primary))" />
      </motion.g>
      {/* Right tone arm */}
      <motion.path d="M195 55 L195 45 L205 45" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" variants={draw} custom={1.5} />
      <motion.line x1="195" y1="55" x2="212" y2="78" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" variants={draw} custom={1.7} />

      {/* ===== CENTER MIXER ===== */}
      <motion.rect x="120" y="55" width="60" height="90" rx="4" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" variants={draw} custom={0.4} />
      {/* Crossfader track */}
      <motion.line x1="130" y1="135" x2="170" y2="135" stroke="hsl(var(--muted-foreground))" strokeWidth="1" strokeOpacity="0.4" variants={draw} custom={2} />
      {/* Crossfader knob */}
      <motion.rect x="145" y="131" width="10" height="8" rx="2" fill="hsl(var(--primary))" fillOpacity="0.7"
        animate={{ x: [140, 155, 140] }}
        transition={{ delay: 3, duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Vertical faders */}
      {[132, 142, 152, 162].map((x, i) => (
        <g key={`fader-${x}`}>
          <motion.line x1={x} y1={75} x2={x} y2={110} stroke="hsl(var(--muted-foreground))" strokeWidth="0.8" strokeOpacity="0.3" variants={draw} custom={2 + i * 0.1} />
          <motion.rect x={x - 3} y={85} width={6} height={5} rx={1} fill="hsl(var(--primary))" fillOpacity="0.6"
            animate={{ y: [82 + i * 3, 90 - i * 2, 82 + i * 3] }}
            transition={{ delay: 2.5 + i * 0.2, duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </g>
      ))}
      {/* Mixer knobs row */}
      {[132, 142, 152, 162].map((x, i) => (
        <motion.circle key={`knob-${x}`} cx={x} cy={67} r={3} fill="none" stroke="hsl(var(--primary))" strokeWidth="0.8"
          variants={draw} custom={1.8 + i * 0.1}
        />
      ))}

      {/* ===== EQ BARS ===== */}
      {[25, 38, 51, 64, 77, 90, 103].map((x, i) => (
        <motion.rect
          key={x} x={x} y={35} width="6" height="0" rx="1.5"
          fill="hsl(var(--primary))"
          fillOpacity="0.5"
          animate={{ height: [4, 14 + Math.sin(i * 1.5) * 8, 4], y: [28, 28 - (14 + Math.sin(i * 1.5) * 8) / 2, 28] }}
          transition={{ delay: 2.5 + i * 0.08, duration: 0.7, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
        />
      ))}

      {/* ===== NOW-PLAYING SCREEN ===== */}
      <motion.rect
        x="200" y="35" width="50" height="18" rx="3"
        fill="hsl(var(--background))"
        stroke="hsl(var(--primary))"
        strokeWidth="1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.2, duration: 0.4 }}
      />
      <motion.foreignObject x="201" y="36" width="48" height="16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.6, duration: 0.4 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "1px 2px" }}>
          <img src={fredAgainIcon} alt="Fred again" width={12} height={12} style={{ borderRadius: 2, flexShrink: 0 }} />
          <div style={{ overflow: "hidden", lineHeight: 1.1 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={track.title}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.2 }}
              >
                <div style={{ fontSize: 4, fontWeight: 700, color: "hsl(var(--primary))", whiteSpace: "nowrap" }}>{track.title}</div>
                <div style={{ fontSize: 3, color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>{track.artist}</div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.foreignObject>
      {/* Progress bar */}
      <motion.rect
        x="203" y="50" width="0" height="1" rx="0.5"
        fill="hsl(var(--primary))"
        fillOpacity="0.6"
        animate={{ width: [0, 44, 0] }}
        transition={{ delay: 3, duration: 6, repeat: Infinity, ease: "linear" }}
      />

      {/* ===== MUSIC NOTES ===== */}
      <motion.text x="260" y="42" fontSize="12" fill="hsl(var(--primary))" fillOpacity="0.5"
        initial={{ opacity: 0, y: 5 }} animate={{ opacity: [0, 0.5, 0], y: [5, -10] }}
        transition={{ delay: 3, duration: 2, repeat: Infinity }}
      >♪</motion.text>
      <motion.text x="270" y="34" fontSize="9" fill="hsl(var(--primary))" fillOpacity="0.4"
        initial={{ opacity: 0, y: 5 }} animate={{ opacity: [0, 0.4, 0], y: [5, -8] }}
        transition={{ delay: 3.5, duration: 2, repeat: Infinity }}
      >♫</motion.text>
      <motion.text x="255" y="52" fontSize="8" fill="hsl(var(--primary))" fillOpacity="0.3"
        initial={{ opacity: 0, y: 3 }} animate={{ opacity: [0, 0.4, 0], y: [3, -6] }}
        transition={{ delay: 4, duration: 2.5, repeat: Infinity }}
      >♪</motion.text>
    </motion.svg>

    {/* Prev / Next buttons */}
    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-3">
      <button
        onClick={prev}
        className="w-6 h-6 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Previous track"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <span className="text-[10px] text-muted-foreground tabular-nums">{trackIndex + 1}/{TRACKS.length}</span>
      <button
        onClick={next}
        className="w-6 h-6 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Next track"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </div>
    </div>
   );
}