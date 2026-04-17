"use client"

import dynamic from "next/dynamic"

const SachinGlobe = dynamic(() => import("@/components/sachin-globe"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-[#060a18]">
      <div className="w-2.5 h-2.5 rounded-full bg-[#4ecdc4] animate-pulse" />
    </div>
  ),
})

export default function Home() {
  return <SachinGlobe />
}
