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

export function SketchAgents() {
  return (
    <motion.svg
      viewBox="0 0 200 200"
      className="w-full h-full"
      initial="hidden"
      animate="show"
    >
      {/* Brain outline */}
      <motion.path
        d="M100 40 C70 40, 45 65, 45 95 C45 120, 60 140, 80 148 L80 170 L120 170 L120 148 C140 140, 155 120, 155 95 C155 65, 130 40, 100 40Z"
        fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" variants={draw} custom={0}
      />
      {/* Neural paths */}
      <motion.path d="M75 80 Q90 70, 100 85 Q110 100, 125 90" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeOpacity="0.6" variants={draw} custom={1} />
      <motion.path d="M70 105 Q85 95, 100 110 Q115 120, 130 105" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeOpacity="0.6" variants={draw} custom={1.5} />
      {/* Nodes */}
      {[[75,80],[100,85],[125,90],[70,105],[100,110],[130,105]].map(([cx,cy], i) => (
        <motion.circle key={i} cx={cx} cy={cy} r="3.5" fill="hsl(var(--primary))" initial={{ scale: 0 }} animate={{ scale: [0, 1.4, 1] }} transition={{ delay: 1.5 + i * 0.12, duration: 0.35 }} />
      ))}
      {/* Antenna / signal arcs */}
      {[16, 24, 32].map((r, i) => (
        <motion.path key={i} d={`M${100-r} ${40-r*0.3} Q100 ${40-r*0.8}, ${100+r} ${40-r*0.3}`} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" strokeOpacity={0.3 + i*0.15} variants={draw} custom={2.5 + i*0.2} />
      ))}
      {/* Base plugs */}
      <motion.line x1="90" y1="170" x2="90" y2="185" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeLinecap="round" variants={draw} custom={3} />
      <motion.line x1="110" y1="170" x2="110" y2="185" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeLinecap="round" variants={draw} custom={3.2} />
    </motion.svg>
  );
}