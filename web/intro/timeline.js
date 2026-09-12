// Original intro-project composition, expressed without GSAP or a build step.
const ease = (time, start, duration) => {
  const p = Math.max(0, Math.min(1, (time - start) / duration));
  return (1 - Math.cos(Math.PI * p)) / 2;
};
export function openingFrame(time) {
  return {
    landscapeY: 352 - 309 * ease(time, 4, 24),
    landscapeOpacity: 0.28 + 0.72 * ease(time, 0, 6),
    foregroundY: 470 + 124 * ease(time, 4, 20),
    titleOpacity: ease(time, 16, 4),
    subtitleOpacity: ease(time, 20, 2),
    footerOpacity: ease(time, 22, 2),
  };
}
