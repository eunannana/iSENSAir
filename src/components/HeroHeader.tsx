"use client";
import Image from "next/image";

export default function HeroHeader() {
  return (
    <section className="relative w-full isolate overflow-hidden">
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
      <div className="absolute inset-0 bg-white/85 backdrop-blur-[2px]" />

      {/* Content */}
      <div className="relative container mx-auto px-4 py-8 md:py-12">
        {/* Logo */}
        <div className="mx-auto w-full max-w-3xl">
          <Image
            src="/img/logo.png"
            alt="UMPSA • EAESB • PPRN"
            width={1600}
            height={400}
            className="w-full h-auto object-contain opacity-95"
            priority
          />
        </div>

        {/* Title */}
        <h1 className="mt-8 text-center text-2xl md:text-4xl font-extrabold tracking-tight text-gray-800 leading-tight">
          SMART RIVER WATER QUALITY MONITORING
          <br className="hidden md:block" />
          WITH AI-DRIVEN DECISION SUPPORT
        </h1>

        {/* Tagline */}
        <p className="mt-3 text-center text-gray-600 text-base md:text-lg">
          From sensor data to intelligent insight, prediction, and action
        </p>

        {/* 🔥 AI Status Badge */}
        <div className="mt-5 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm text-gray-700 shadow-sm">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            AI Monitoring System Active
          </div>
        </div>


        {/* 🔥 CTA Hint */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Select a monitoring area below to view AI-based analysis and insights
          </p>
        </div>
      </div>
    </section>
  );
}

function QuickInfoCard({
  title,
  value,
  highlight,
}: {
  title: string;
  value: string;
  highlight?: "red" | "green";
}) {
  const highlightClass =
    highlight === "red"
      ? "text-red-600"
      : highlight === "green"
      ? "text-emerald-600"
      : "text-gray-900";

  return (
    <div className="rounded-xl border bg-white/90 backdrop-blur p-4 text-center shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{title}</p>
      <p className={`text-sm font-semibold ${highlightClass}`}>
        {value}
      </p>
    </div>
  );
}