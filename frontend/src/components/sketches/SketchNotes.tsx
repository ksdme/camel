import { motion } from "framer-motion";

import type { Variants } from "framer-motion";

const draw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: (i: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { delay: i * 0.15, duration: 0.8, ease: "easeInOut" as const }, opacity: { delay: i * 0.15, duration: 0.01 } },
  }),
};

export function SketchNotes() {
  return (
    <motion.svg
      viewBox="0 0 200 200"
      className="w-full h-full"
      initial="hidden"
      animate="show"
    >
      {/* Notebook body */}
      <motion.rect x="40" y="25" width="120" height="155" rx="6" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" variants={draw} custom={0} />
      {/* Spine */}
      <motion.line x1="60" y1="25" x2="60" y2="180" stroke="hsl(var(--primary))" strokeWidth="1.5" variants={draw} custom={0.5} />
      {/* Lines */}
      {[55, 75, 95, 115, 135, 155].map((y, i) => (
        <motion.line key={y} x1="72" y1={y} x2="145" y2={y} stroke="hsl(var(--muted-foreground))" strokeWidth="1" strokeOpacity="0.4" variants={draw} custom={1 + i * 0.2} />
      ))}
      {/* Pencil */}
      <motion.g variants={draw} custom={2.5}>
        <motion.line x1="130" y1="140" x2="165" y2="105" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" variants={draw} custom={2.5} />
        <motion.line x1="165" y1="105" x2="170" y2="100" stroke="hsl(var(--accent-foreground))" strokeWidth="2" strokeLinecap="round" variants={draw} custom={2.8} />
      </motion.g>
      {/* Checkmark on first line */}
      <motion.polyline points="74,53 78,58 86,48" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={draw} custom={3} />
      {/* Floating dot accents */}
      <motion.circle cx="150" cy="35" r="3" fill="hsl(var(--primary))" initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: 2.5, duration: 0.4 }} />
      <motion.circle cx="45" cy="20" r="2" fill="hsl(var(--muted-foreground))" fillOpacity="0.4" initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: 2.8, duration: 0.4 }} />
    </motion.svg>
  );
}