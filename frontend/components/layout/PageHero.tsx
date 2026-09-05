'use client';

import React, { useEffect, useState } from 'react';

export function PageHero() {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      // Calculate scroll progress over the first 280px of scrolling
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const fadeDistance = 280;
      const progress = Math.min(1, Math.max(0, scrollY / fadeDistance));
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Opacity smoothly transitions from 1 down to 0
  const opacity = Math.max(0, 1 - scrollProgress * 1.2);
  // Blur smoothly increases from 0px up to 12px
  const blurAmount = (scrollProgress * 12).toFixed(1);
  // Subtle upward drift
  const translateY = (-scrollProgress * 30).toFixed(1);

  return (
    <div
      className="sticky top-0 z-0 w-full h-[45vh] min-h-[320px] max-h-[480px] overflow-hidden flex flex-col items-center justify-center text-center pointer-events-none select-none transition-transform"
      style={{
        opacity,
        filter: `blur(${blurAmount}px)`,
        transform: `translate3d(0, ${translateY}px, 0)`,
        willChange: 'opacity, filter, transform',
      }}
    >
      {/* Subtle Micro-Texture Overlay Mask */}
      <div
        className="absolute inset-0 bg-micro-texture [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_60%,transparent_100%)] opacity-60"
        aria-hidden="true"
      />

      {/* Centered Dynamic Heading */}
      <div className="relative z-10">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black font-heading tracking-tight bg-gradient-to-r from-white via-[#3ecf8e] to-[#e5e7eb] bg-clip-text text-transparent animate-shimmer">
          iwantajob
        </h1>
      </div>
    </div>
  );
}

export default PageHero;
