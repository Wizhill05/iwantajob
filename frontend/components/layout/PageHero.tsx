'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PageHeroProps {
  title?: string;
}

// Simple seeded pseudo-random number generator (LCG)
function seededRandom(seed: number) {
  const m = 0x80000000;
  const a = 1103515245;
  const c = 12345;
  let s = seed ? seed : Math.floor(Math.random() * m);
  return function () {
    s = (a * s + c) % m;
    return s / (m - 1);
  };
}

export function PageHero({ title = 'iwantajob' }: PageHeroProps) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Scroll effect tracking
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const fadeDistance = 180; // Fades out completely by 180px scroll
      const progress = Math.min(1, Math.max(0, scrollY / fadeDistance));
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Generate randomized green noise dots with gradient density across 100% full viewport width
  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const renderDots = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Set internal canvas resolution to match display exactly
      canvas.width = width;
      canvas.height = height;

      ctx.clearRect(0, 0, width, height);

      const rng = seededRandom(429496729); // Deterministic seed for stable appearance

      // 15% of viewport height cutoff
      const cutoffY = height * 0.15;
      const numDots = Math.floor((width * cutoffY) / 120); // Balanced density

      for (let i = 0; i < numDots; i++) {
        const x = rng() * width;
        // Non-linear distribution: heavily weighted towards top (y = 0)
        // Using power curve so density sharply drops to 0 at cutoffY
        const normalizedY = Math.pow(rng(), 1.8);
        const y = normalizedY * cutoffY;

        // Density factor drops from 1 at top to 0 at cutoffY
        const densityFactor = 1 - y / cutoffY;
        if (densityFactor <= 0.02) continue;

        // Randomized dot size (1px to 2px)
        const radius = rng() > 0.85 ? 1.5 : 1;

        // Opacity drops from ~0.65 near top to 0 near cutoff
        const alpha = (0.2 + rng() * 0.5) * densityFactor;

        ctx.fillStyle = `rgba(62, 207, 142, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    renderDots();

    const handleResize = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(renderDots);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [mounted]);

  // Opacity smoothly drops from 1 to 0
  const opacity = Math.max(0, 1 - scrollProgress * 1.25);
  // Blur smoothly increases from 0px to 10px
  const blurAmount = (scrollProgress * 10).toFixed(1);
  const translateY = (-scrollProgress * 20).toFixed(1);

  return (
    <>
      {/* Full-width canvas mounted directly to document body to spread dots 100% edge-to-edge */}
      {mounted &&
        createPortal(
          <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-0"
            style={{
              opacity,
              filter: `blur(${blurAmount}px)`,
              willChange: 'opacity, filter',
            }}
            aria-hidden="true"
          />,
          document.body
        )}

      {/* Hero container covering ~30% viewport height with dynamic shimmer heading */}
      <div
        className="sticky top-0 z-0 w-full h-[28vh] min-h-[190px] max-h-[250px] flex flex-col items-center justify-center text-center pointer-events-none select-none transition-transform"
        style={{
          opacity,
          filter: `blur(${blurAmount}px)`,
          transform: `translate3d(0, ${translateY}px, 0)`,
          willChange: 'opacity, filter, transform',
        }}
      >
        {/* Centered Dynamic Heading */}
        <div className="relative z-10 px-4 py-3">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black font-heading tracking-tight leading-normal md:leading-relaxed pb-1 bg-gradient-to-r from-white via-[#3ecf8e] to-[#e5e7eb] bg-clip-text text-transparent animate-shimmer">
            {title}
          </h1>
        </div>
      </div>
    </>
  );
}

export default PageHero;
