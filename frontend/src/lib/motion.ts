// Shared Framer Motion config for consistent feel across the app
import type { Transition, Variants } from "framer-motion";

// Consistent easing curve — slightly bouncy, organic feel
export const ease = [0.22, 1, 0.36, 1] as const;
export const easeOut = [0, 0, 0.2, 1] as const;

export const spring = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

export const springGentle = {
  type: "spring" as const,
  stiffness: 200,
  damping: 25,
  mass: 1,
};

// Standard transitions
export const fadeIn: Transition = { duration: 0.4, ease };
export const fadeInFast: Transition = { duration: 0.25, ease };
export const slideUp: Transition = { duration: 0.35, ease };

// Stagger container
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
      ease,
    },
  },
};

// Stagger child — slide up + fade
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease },
  },
};

// Editor entrance
export const editorEntrance: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease },
  },
};

// Chat panel slide
export const chatPanelVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease },
  },
  exit: {
    opacity: 0,
    y: 24,
    scale: 0.97,
    transition: { duration: 0.2, ease: easeOut },
  },
};

// Message bubble
export const messageBubble: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.25, ease },
  },
};