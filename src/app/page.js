'use client';

import dynamic from 'next/dynamic';

const KeralMapAnalyzer = dynamic(
  () => import('../components/KeralMapAnalyzer'),
  { 
    ssr: false,
    loading: () => (
      <div className="h-screen w-full flex items-center justify-center bg-[#0f0f14]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-3 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 text-sm">Loading Map...</p>
        </div>
      </div>
    )
  }
);

export default function Home() {
  return <KeralMapAnalyzer />;
}
