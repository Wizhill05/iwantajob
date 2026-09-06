import React from 'react';

export default function RootLoading() {
  return (
    <div className="relative max-w-7xl mx-auto px-4 py-8 animate-pulse space-y-6">
      {/* Top Header Skeleton */}
      <div className="h-8 w-48 bg-[#202020] rounded-lg mx-auto" />

      {/* Hero / Filter Bar Skeleton */}
      <div className="h-14 bg-[#181818] border border-[#262626] rounded-xl w-full" />

      {/* Row Card Skeletons */}
      <div className="border border-[#262626] rounded-xl overflow-hidden divide-y divide-[#262626]">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="p-4 bg-[#141414] flex items-center justify-between gap-4">
            <div className="space-y-2.5 flex-1">
              <div className="h-4 bg-[#222222] rounded w-2/5" />
              <div className="h-3 bg-[#1c1c1c] rounded w-1/4" />
            </div>
            <div className="h-5 bg-[#222222] rounded w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
