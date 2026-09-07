'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Star, Github } from 'iconoir-react';

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

export function PageFooter() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const renderDots = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;

      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);

      // Seeded random for stable dot pattern
      const rng = seededRandom(8493021);
      const numDots = Math.floor((width * height) / 220);

      for (let i = 0; i < numDots; i++) {
        const x = rng() * width;
        // Non-linear distribution: weighted towards bottom (y = height)
        const normalizedY = 1 - Math.pow(rng(), 1.6);
        const y = normalizedY * height;

        // Density increases towards the bottom
        const densityFactor = y / height;
        if (densityFactor <= 0.05) continue;

        const radius = rng() > 0.85 ? 1.5 : 1;
        const alpha = (0.15 + rng() * 0.45) * densityFactor;

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

  return (
    <footer
      ref={containerRef}
      className="relative w-full h-[32vh] min-h-[260px] flex flex-col items-center justify-end pb-28 sm:pb-8 select-none overflow-hidden"
    >
      {/* Background Gradient Dots Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-0"
        aria-hidden="true"
      />

      {/* Subtle Bottom Glow Mask */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-transparent via-[#131313]/50 to-[#131313]/90 pointer-events-none z-0"
        aria-hidden="true"
      />

      {/* Footer Content */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-3 px-4 text-center">
        {/* GitHub Star Note & Repo Link */}
        <Link
          href="https://github.com/Wizhill05/iwantajob"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#181818]/90 hover:bg-[#202020] border border-[#262626] hover:border-[#3ecf8e]/50 shadow-lg backdrop-blur-sm transition-all duration-200 active:scale-[0.98]"
        >
          <Github className="w-4 h-4 text-white group-hover:text-[#3ecf8e] transition-colors" />
          <span className="text-xs font-heading font-semibold text-white group-hover:text-[#3ecf8e] transition-colors">
            iwantajob
          </span>
          <span className="h-3 w-px bg-[#2e2e2e]" aria-hidden="true" />
          <span className="inline-flex items-center gap-1 text-[11px] font-sans font-medium text-[#3ecf8e]">
            <Star className="w-3.5 h-3.5 fill-[#3ecf8e]" />
            <span>Star it on GitHub</span>
          </span>
        </Link>

        {/* Minimal Copyright / Tagline */}
        <p className="text-[11px] font-sans text-[#6b7280]">
          Autonomous Job Discovery &amp; Normalization Platform
        </p>
      </div>
    </footer>
  );
}

export default PageFooter;
