'use client';

import React from 'react';

export function PageHero() {
  return (
    <div className="relative w-full py-6 sm:py-8 my-2 overflow-hidden flex flex-col items-center justify-center text-center">
      {/* Subtle Micro-Texture Overlay Mask */}
      <div
        className="absolute inset-0 bg-micro-texture pointer-events-none [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_60%,transparent_100%)] opacity-70"
        aria-hidden="true"
      />

      {/* Centered Dynamic Heading */}
      <div className="relative z-10 select-none">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-heading tracking-tight bg-gradient-to-r from-[#e5e7eb] via-[#3ecf8e] to-[#f3f4f6] bg-clip-text text-transparent animate-shimmer">
          iwantajob
        </h1>
      </div>
    </div>
  );
}

export default PageHero;
