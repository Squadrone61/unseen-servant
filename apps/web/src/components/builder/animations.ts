import type { Variants, TargetAndTransition } from "framer-motion";

export const stepTransition: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15, ease: "easeIn" } },
};

export const gridItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.02, duration: 0.2, ease: "easeOut" },
  }),
};

export const cardHover: TargetAndTransition = {
  scale: 1.02,
  transition: { duration: 0.15, ease: "easeOut" as const },
};
