// Shared motion presets — import these instead of inlining spring/ease values

export const ease = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
} as const;

export const spring = {
  snappy: { type: "spring" as const, stiffness: 380, damping: 32, mass: 0.9 },
  soft:   { type: "spring" as const, stiffness: 260, damping: 28, mass: 1 },
  press:  { type: "spring" as const, stiffness: 500, damping: 30, mass: 0.8 },
};

export const fadeUpBlur = {
  hidden: { opacity: 0, y: 16, scale: 0.98, filter: "blur(6px)" },
  show: {
    opacity: 1, y: 0, scale: 1, filter: "blur(0px)",
    transition: { duration: 0.45, ease: ease.out, delay: 0.06 },
  },
};

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

// For individual items inside a stagger parent
export const listItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: ease.out } },
};

// Direction-aware crossfade for tab switching.
// Use with custom={dir} (dir = 1 for forward, -1 for backward).
export const tabContent = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 16, filter: "blur(4px)" }),
  center: {
    opacity: 1, x: 0, filter: "blur(0px)",
    transition: { duration: 0.35, ease: ease.out, delay: 0.04 },
  },
  exit: (dir: number) => ({
    opacity: 0, x: dir * -16, filter: "blur(4px)",
    transition: { duration: 0.18, ease: ease.inOut },
  }),
};

export const buttonPress = {
  rest:  { scale: 1 },
  hover: { scale: 0.96, transition: spring.press },
  tap:   { scale: 0.90, transition: spring.press },
};
