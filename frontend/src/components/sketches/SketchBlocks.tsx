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

const blockDrop = (i: number) => ({
  initial: { y: -40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: { delay: 0.5 + i * 0.25, duration: 0.5, type: "spring" as const, stiffness: 200, damping: 15 },
});

export function SketchBlocks() {
  return (
    <motion.svg
      viewBox="0 0 200 200"
      className="w-full h-full"
      initial="hidden"
      animate="show"
    >
      {/* Ground line */}
      <motion.line x1="30" y1="175" x2="170" y2="175" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeOpacity="0.3" strokeDasharray="4 4" variants={draw} custom={0} />

      {/* Block 1 — bottom left */}
      <motion.rect x="50" y="135" width="45" height="38" rx="4" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" {...blockDrop(0)} />
      <motion.line x1="60" y1="147" x2="85" y2="147" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.4" {...blockDrop(0)} />
      <motion.line x1="60" y1="155" x2="78" y2="155" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.4" {...blockDrop(0)} />

      {/* Block 2 — bottom right */}
      <motion.rect x="105" y="135" width="45" height="38" rx="4" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" {...blockDrop(1)} />
      <motion.circle cx="127" cy="154" r="8" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" strokeOpacity="0.5" {...blockDrop(1)} />

      {/* Block 3 — top center */}
      <motion.rect x="75" y="90" width="50" height="42" rx="4" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" {...blockDrop(2)} />
      <motion.path d="M88 105 L95 115 L112 100" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...blockDrop(2)} />

      {/* Block 4 — top-top, keystone */}
      <motion.rect x="82" y="48" width="36" height="36" rx="4" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" {...blockDrop(3)} />
      <motion.path d="M93 62 L100 56 L107 62 L107 72 L93 72Z" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" {...blockDrop(3)} />

      {/* Connecting dashed guides */}
      <motion.line x1="72" y1="135" x2="86" y2="132" stroke="hsl(var(--muted-foreground))" strokeWidth="0.8" strokeDasharray="3 3" strokeOpacity="0.3" variants={draw} custom={4} />
      <motion.line x1="127" y1="135" x2="114" y2="132" stroke="hsl(var(--muted-foreground))" strokeWidth="0.8" strokeDasharray="3 3" strokeOpacity="0.3" variants={draw} custom={4} />
      <motion.line x1="100" y1="90" x2="100" y2="84" stroke="hsl(var(--muted-foreground))" strokeWidth="0.8" strokeDasharray="3 3" strokeOpacity="0.3" variants={draw} custom={4.5} />

      {/* Sparkle */}
      <motion.circle cx="140" cy="55" r="2.5" fill="hsl(var(--primary))" initial={{ scale: 0 }} animate={{ scale: [0, 1.5, 1, 1.3, 1] }} transition={{ delay: 2.5, duration: 0.6 }} />
      <motion.circle cx="55" cy="125" r="2" fill="hsl(var(--primary))" fillOpacity="0.5" initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: 2.8, duration: 0.4 }} />
    </motion.svg>
  );
}