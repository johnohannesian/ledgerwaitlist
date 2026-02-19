"use client";

import React, { useState, useEffect } from "react";
import Script from "next/script";

const Header = () => {
  return (
    <header className="w-full px-6 sm:px-10 py-6 flex justify-between items-center z-50">
      <div className="bg-white bg-opacity-10 rounded-full px-4 py-2 flex items-center backdrop-blur-md border border-white border-opacity-5">
        <span className="font-bold tracking-tight text-base">Ledger</span>
      </div>
    </header>
  );
};

const BlobBackground = () => {
  return (
    <svg className="absolute w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 opacity-80" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#2DFF4B"
        d="M440.5,320.5Q418,391,355.5,443Q293,495,214.5,459Q136,423,94.5,348Q53,273,99,203.5Q145,134,223,109.5Q301,85,368.5,142.5Q436,200,440.5,320.5Z"
        style={{ animation: "blob-morph 8s ease-in-out infinite" }}
      >
        <animate
          attributeName="d"
          dur="8s"
          repeatCount="indefinite"
          values="
            M440.5,320.5Q418,391,355.5,443Q293,495,214.5,459Q136,423,94.5,348Q53,273,99,203.5Q145,134,223,109.5Q301,85,368.5,142.5Q436,200,440.5,320.5Z;
            M427.5,335.5Q410,421,326,432Q242,443,181.5,404Q121,365,92.5,296.5Q64,228,111.5,166Q159,104,233.5,88Q308,72,376.5,136Q445,200,427.5,335.5Z;
            M440.5,320.5Q418,391,355.5,443Q293,495,214.5,459Q136,423,94.5,348Q53,273,99,203.5Q145,134,223,109.5Q301,85,368.5,142.5Q436,200,440.5,320.5Z
          "
        />
      </path>
    </svg>
  );
};

/** Placeholder card image (data URI) so slabs always show something without external requests */
const PLACEHOLDER_SLAB_DATA =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:%23222"/><stop offset="100%" style="stop-color:%231a1a1a"/></linearGradient></defs><rect width="300" height="400" fill="url(%23g)"/><rect x="20" y="20" width="260" height="360" rx="8" fill="none" stroke="%23333" stroke-width="2"/><text x="150" y="200" font-family="system-ui" font-size="14" fill="%23666" text-anchor="middle">Add slab image to public/slabs/</text></svg>'
  );

/** Slab images: must live at public/slabs/slab1.jpg … slab8.jpg (Next.js serves public/ at /) */
const SLAB_BASES = ["slab1", "slab2", "slab3", "slab4", "slab5", "slab6", "slab7", "slab8"] as const;
const SLAB_IMAGES: { sources: string[]; fallback: string; alt: string }[] = SLAB_BASES.map((base, i) => ({
  sources: [`/slabs/${base}.jpg`, `/slabs/${base}.png`],
  fallback: PLACEHOLDER_SLAB_DATA,
  alt: `Trading card slab ${i + 1}`,
}));

const RealSlab = ({
  sources,
  fallback,
  alt,
  className,
  style,
}: {
  sources: string[];
  fallback: string;
  alt: string;
  className: string;
  style: React.CSSProperties;
}) => {
  const [sourceIndex, setSourceIndex] = useState(0);
  const currentSrc = sourceIndex < sources.length ? sources[sourceIndex]! : fallback;

  const handleError = () => {
    if (sourceIndex < sources.length - 1) {
      setSourceIndex((i) => i + 1);
    } else {
      setSourceIndex(sources.length);
    }
  };

  return (
    <div
      className={`absolute w-full h-full rounded-[20px] border-4 border-white border-opacity-10 overflow-hidden transition-all duration-700 ${className}`}
      style={{
        background: "linear-gradient(145deg, #2a2a2a, #1a1a1a)",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(255,255,255,0.05)",
        transformStyle: "preserve-3d",
        ...style,
      }}
    >
      <div className="w-full h-full relative bg-gray-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={currentSrc}
          src={currentSrc}
          alt={alt}
          className="w-full h-full object-cover opacity-100"
          loading="eager"
          fetchPriority="high"
          onError={handleError}
        />
      </div>
    </div>
  );
};

const Sparkle = ({ style }: { style?: React.CSSProperties }) => {
  return (
    <svg className="absolute w-5 h-5 text-white opacity-50" style={{ animation: "twinkle 2s infinite", ...style }} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z" />
    </svg>
  );
};

export function SignUpPage() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % SLAB_IMAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const getSlabClassName = (index: number) => {
    if (index === currentIndex) return "opacity-100 z-10";
    if (index === (currentIndex + 1) % SLAB_IMAGES.length) return "opacity-60 z-[5]";
    return "opacity-0 z-[1]";
  };

  const getSlabStyle = (index: number): React.CSSProperties => {
    if (index === currentIndex) {
      return { transform: "translateX(0) scale(1) rotate(0deg)" };
    }
    if (index === (currentIndex + 1) % SLAB_IMAGES.length) {
      return { transform: "translateX(40px) scale(0.9) rotate(5deg)", filter: "blur(1px)" };
    }
    return { transform: "translateX(80px) scale(0.8) rotate(10deg)" };
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-x-hidden font-inter">
      <Header />

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 max-w-[1440px] mx-auto w-full relative px-4 lg:px-0">
        <div className="pl-0 lg:pl-20 flex flex-col justify-center py-8 lg:py-0 relative">
          <div className="relative z-10">
          <div
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-bold mb-5 bg-orange-500 text-black w-fit"
            style={{ transform: "rotate(-2deg)" }}
          >
            <span>🔥</span> Beta Coming Soon
          </div>

          <h1 className="text-[48px] sm:text-[62px] lg:text-[82px] leading-[0.95] font-extrabold tracking-tighter mb-6">
            Collect.
            <br />
            Trade.
            <br />
            <span className="text-green-400">Zero Fees.</span>
          </h1>

          <p className="text-gray-400 text-base sm:text-lg max-w-[440px] leading-6 mb-10">
            The liquid marketplace for graded assets. Buy, sell, and vault your grails with instant settlement and verified authenticity.
          </p>

          <div className="w-full max-w-[440px]">
            <div id="getWaitlistContainer" data-waitlist_id="32523" data-widget_type="WIDGET_1" />
          </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center overflow-hidden min-h-[400px] lg:min-h-[520px] py-8">
          <BlobBackground />

          <div className="w-[280px] h-[420px] sm:w-[340px] sm:h-[520px] relative z-10" style={{ perspective: "1200px" }}>
            {SLAB_IMAGES.map((slab, index) => (
              <RealSlab
                key={slab.sources[0]}
                sources={slab.sources}
                fallback={slab.fallback}
                alt={slab.alt}
                className={getSlabClassName(index)}
                style={getSlabStyle(index)}
              />
            ))}
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 flex-wrap justify-center max-w-[90vw]">
            {SLAB_IMAGES.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentIndex ? "w-6 bg-white" : "w-2 bg-gray-700"
                }`}
              />
            ))}
          </div>

          <Sparkle style={{ top: "20%", right: "20%" }} />
          <Sparkle style={{ bottom: "30%", left: "10%", animationDelay: "1s" }} />
        </div>
      </main>

      <Script src="https://prod-waitlist-widget.s3.us-east-2.amazonaws.com/getwaitlist.min.js" strategy="afterInteractive" />
    </div>
  );
}
