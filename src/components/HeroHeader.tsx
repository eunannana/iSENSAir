"use client";
import Image from "next/image";

export default function HeroHeader() {
    return (
        <section className="relative w-full isolate overflow-hidden">
            {/* Background foto full-bleed */}
            <Image
                src="/img/hero-river.jpg"
                alt=""
                fill
                priority
                className="object-cover object-center"
                sizes="100vw"
                quality={85}
            />

            {/* Overlay supaya teks terbaca; atur opacity sesuai selera */}
            <div className="absolute inset-0 bg-white/80" />

            {/* Konten: boleh tetap dibatasi container; fotonya tetap full */}
            <div className="relative container mx-auto px-4 py-10 md:py-16">
                {/* Logo */}
                <div className="mx-auto w-full max-w-4xl">
                    <Image
                        src="/img/logo.png"
                        alt="UMPSA • EAESB • PPRN"
                        width={1600}
                        height={400}
                        className="w-full h-auto object-contain"
                        priority
                        sizes="(min-width: 1024px) 768px, 90vw"
                        quality={90}
                    />
                </div>

                <h1 className="mt-12 text-center text-3xl md:text-5xl font-extrabold tracking-tight text-gray-800">
                    iSENS-AIR: AI for River Water Quality Monitoring
                </h1>

                <p className="mt-4 text-center text-gray-700 text-xl">
                    Real-time and historical monitoring of water quality, powered by AI and IoT.
                </p>

                <p className="mt-6 max-w-3xl mx-auto text-center text-gray-700 text-base md:text-lg leading-relaxed">
                    iSENS-AIR enables industries and agencies to monitor river water quality
                    through AI-powered analysis, IoT connectivity, and cloud-based dashboards.
                </p>
            </div>
        </section>
    );
}
