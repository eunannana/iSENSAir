"use client";

import React, { forwardRef, useMemo, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import Image from "next/image";

const FlipBook = HTMLFlipBook as unknown as React.ComponentType<any>;

type FlipPageProps = {
  src: string;
  alt: string;
};

const FlipPage = forwardRef<HTMLDivElement, FlipPageProps>(
  ({ src, alt }, ref) => {
    return (
      <div
        ref={ref}
        className="flex h-full w-full items-center justify-center bg-white"
      >
        <div className="relative h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <Image
            src={src}
            alt={alt}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority={false}
          />
        </div>
      </div>
    );
  }
);

FlipPage.displayName = "FlipPage";

type UserManualFlipbookProps = {
  totalPages: number;
};

export default function UserManualFlipbook({
  totalPages,
}: UserManualFlipbookProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const pages = useMemo(() => {
    return Array.from({ length: totalPages }, (_, i) => ({
      pageNumber: i + 1,
      src: `/manual-pages/page-${i + 1}.jpg`,
      alt: `Manual page ${i + 1}`,
    }));
  }, [totalPages]);

  return (
    <div className="flex w-full flex-col items-center">
      <div className="mb-4 text-sm text-gray-500">
        Page {currentPage} of {totalPages}
      </div>

      <div className="w-full overflow-x-auto rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-inner">
        <div className="mx-auto flex justify-center">
          <FlipBook
            width={380}
            height={540}
            size="stretch"
            minWidth={250}
            maxWidth={420}
            minHeight={360}
            maxHeight={620}
            showCover={true}
            mobileScrollSupport={true}
            drawShadow={true}
            flippingTime={700}
            usePortrait={true}
            startPage={0}
            onFlip={(e: any) => setCurrentPage(e.data + 1)}
          >
            {pages.map((page) => (
              <FlipPage
                key={page.pageNumber}
                src={page.src}
                alt={page.alt}
              />
            ))}
          </FlipBook>
        </div>
      </div>

      <p className="mt-4 text-center text-sm text-gray-500">
        Flip the pages to browse the manual interactively.
      </p>
    </div>
  );
}