import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";
import { SketchDj } from "@/components/sketches/SketchDj";
import type { ComponentType } from "react";

interface SketchItem {
  id: string;
  Component: ComponentType;
  label: string;
  tagline: string;
  accent: string;
}

const SKETCHES: SketchItem[] = [
  { id: "dj", Component: SketchDj, label: "", tagline: "", accent: "from-amber-500/10 to-amber-100/20" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const INTERVAL_KEY = "sketch-interval";
const INTERVAL_OPTIONS = [3, 4, 5, 6, 8, 10];

function getStoredInterval(): number {
  try {
    const v = parseInt(localStorage.getItem(INTERVAL_KEY) || "", 10);
    return INTERVAL_OPTIONS.includes(v) ? v : 8;
  } catch { return 8; }
}

export function SketchShowcase() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [interval] = useState(getStoredInterval);
  const sketches = useMemo(() => shuffle(SKETCHES), []);

  const next = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % sketches.length);
  }, [sketches.length]);

  useEffect(() => {
    if (sketches.length <= 1) return;
    const timer = setInterval(next, interval * 1000);
    return () => clearInterval(timer);
  }, [next, interval, sketches.length]);

  const current = sketches[currentIndex % sketches.length];

  return (
    <div className="flex flex-col items-center justify-center">
      {/* Hero text */}
      <motion.div
        className="text-center mb-6 sm:mb-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
      >
        <h2 className="text-h2 text-foreground tracking-tight mb-3">
          Something's cooking…
        </h2>
        <p className="text-body text-muted-foreground max-w-sm mx-auto">
          Select a note from the sidebar, or drop an idea in the chat below
        </p>
      </motion.div>

      {/* Single sketch cycling */}
      <div className="relative w-64 h-64 sm:w-80 sm:h-80">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0 }}
            className="absolute inset-0 flex flex-col items-center"
          >
            <div
              className={`w-full aspect-square rounded-2xl border border-border overflow-hidden relative`}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${current.accent} opacity-60`}
              />
              <div className="relative w-full h-full p-4">
                <current.Component />
              </div>
            </div>
            {current.label && <p className="text-meta text-muted-foreground mt-2">{current.label}</p>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots */}
      <div className="flex items-center gap-2 mt-4">
        {sketches.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setCurrentIndex(i)}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentIndex ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}