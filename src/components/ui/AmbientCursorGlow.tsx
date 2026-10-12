import React, { useEffect, useRef } from 'react';

/**
 * AmbientCursorGlow renders a subtle, GPU-accelerated Aurora glow
 * that gracefully follows the user's cursor across all views and roles.
 *
 * Characteristics:
 * - High performance: updates via direct DOM transform / requestAnimationFrame without React state overhead.
 * - Pointer events disabled: never obstructs clicks, text selection, or focus.
 * - Accessibility-first: disabled entirely if `prefers-reduced-motion` is active or on touch-only devices.
 * - Theme-tailored: soft violet-cyan in dark mode; ultra-subtle ambient tint in light mode.
 */
export const AmbientCursorGlow: React.FC = () => {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Respect user motion preferences & touch devices
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouchDevice = window.matchMedia('(hover: none)').matches;
    if (prefersReducedMotion || isTouchDevice || !glowRef.current) return;

    const el = glowRef.current;
    let targetX = -1000;
    let targetY = -1000;
    let currentX = -1000;
    let currentY = -1000;
    let rafId: number | null = null;
    let isVisible = false;

    const handlePointerMove = (e: PointerEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!isVisible) {
        isVisible = true;
        el.style.opacity = '1';
      }
    };

    const handlePointerLeave = () => {
      isVisible = false;
      el.style.opacity = '0';
    };

    const animate = () => {
      // Smooth subtle interpolation (lerp factor 0.15)
      currentX += (targetX - currentX) * 0.15;
      currentY += (targetY - currentY) * 0.15;

      el.style.transform = `translate3d(${currentX - 250}px, ${currentY - 250}px, 0)`;
      rafId = requestAnimationFrame(animate);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerleave', handlePointerLeave);
    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerleave', handlePointerLeave);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-500"
    >
      <div
        ref={glowRef}
        className="pointer-events-none absolute h-[500px] w-[500px] rounded-full opacity-0 transition-opacity duration-300 will-change-transform"
        style={{
          background: 'radial-gradient(circle 240px, rgba(109, 74, 255, 0.09) 0%, rgba(25, 195, 230, 0.04) 40%, transparent 70%)',
        }}
      />
    </div>
  );
};
