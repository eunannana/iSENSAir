"use client";

import Image from "next/image";
import { ReactNode } from "react";

type HeroHeaderProps = {
  children?: ReactNode;
};

export default function HeroHeader({ children }: HeroHeaderProps) {
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
      <div className="absolute inset-0 bg-white/85 backdrop-blur-[2px]" />

      {/* Main Content */}
      <div className="relative mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-7xl flex-col px-4 pt-8 pb-6 md:px-6 md:pt-10 md:pb-8">
        {/* Top Hero Content */}
        <div className="flex flex-col items-center text-center">
          {/* Logo */}
          <div className="mx-auto w-full max-w-3xl">
            <Image
              src="/img/logo.png"
              alt="UMPSA • EAESB • PPRN"
              width={1600}
              height={400}
              className="h-auto w-full object-contain opacity-95"
              priority
            />
          </div>

          {/* Title */}
          <h1 className="mt-8 text-center text-2xl font-extrabold leading-tight tracking-tight text-gray-800 md:text-4xl xl:text-5xl">
            SMART RIVER WATER QUALITY MONITORING
            <br className="hidden md:block" />
            WITH AI-DRIVEN DECISION SUPPORT
          </h1>

          {/* Tagline */}
          <p className="mt-3 max-w-2xl text-center text-base text-gray-600 md:text-lg">
            From sensor data to intelligent insight, prediction, and action
          </p>

          {/* AI Status Badge */}
          <div className="mt-5 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-2 text-sm text-gray-700 shadow-sm backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              AI Monitoring System Active
            </div>
          </div>

          {/* CTA Hint */}
          <div className="mt-5 text-center">
            <p className="text-sm text-gray-500">
              Select a monitoring area below to view AI-based analysis and
              insights
            </p>
          </div>
        </div>

        {/* Child content still inside hero area */}
        {children ? (
          <div className="mt-5 md:mt-6 flex-1">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
