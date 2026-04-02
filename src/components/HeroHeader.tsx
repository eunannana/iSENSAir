"use client";

import Image from "next/image";

type HeroHeaderProps = {
  onScrollToMap: () => void;
};

export default function HeroHeader({ onScrollToMap }: HeroHeaderProps) {
  return (
    <section className="relative isolate w-full overflow-hidden">
      {/* Background */}
      <Image
        src="/img/hero-river.jpg"
        alt=""
        fill
        priority
        className="object-cover object-center"
        sizes="100vw"
        quality={85}
      />

      {/* Overlay */}
      <div className="absolute inset-0 bg-white/84 backdrop-blur-[2px]" />

      {/* Content */}
      <div className="relative mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-7xl flex-col items-center justify-center px-4 py-12 text-center md:px-6 md:py-16">
        {/* Logo */}
        <div className="mx-auto w-full max-w-2xl">
          <Image
            src="/img/logo.png"
            alt="UMPSA • EAESB • PPRN"
            width={1600}
            height={400}
            className="h-auto w-full object-contain opacity-95"
            priority
          />
        </div>

        <h1 className="mt-6 text-center text-3xl font-extrabold leading-tight tracking-tight text-gray-800 sm:text-4xl lg:text-5xl">
          <span className="block whitespace-nowrap">
            SMART RIVER WATER QUALITY MONITORING
          </span>

          <span className="block whitespace-nowrap">
            AI-DRIVEN DECISION SUPPORT
          </span>
        </h1>

        {/* Tagline */}
        <p className="mt-4 max-w-2xl text-center text-sm text-gray-600 sm:text-base md:text-lg">
          From sensor data to intelligent insight, prediction, and action
        </p>

        {/* TEXT (dipindah ke atas button) */}
        <p className="mt-6 text-sm text-gray-500">
          Explore the monitoring locations and open the AI-based dashboard
        </p>

        {/* BUTTON (dipindah ke bawah) */}
        <div className="mt-4">
          <button
            onClick={onScrollToMap}
            className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
          >
            View Monitoring Map
          </button>
        </div>
      </div>
    </section>
  );
}
