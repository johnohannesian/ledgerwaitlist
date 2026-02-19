"use client";

import { useEffect, useState, useRef } from "react";

interface AnimatedItem {
  id: number;
  content: string;
  type: "amount" | "emoji";
  x: number; // percentage
  y: number; // percentage
}

function formatAmount(): string {
  const amounts = [
    "$25", "$42", "$58", "$75", "$98", "$125", "$150", "$200", "$275",
    "$350", "$450", "$550", "$675", "$850", "$1,200", "$1,500", "$2,000",
    "$3,500", "$5,000", "$7,500", "$10,000", "$15,000", "$25,000",
  ];
  return amounts[Math.floor(Math.random() * amounts.length)]!;
}

function getRandomEmoji(): string {
  const emojis = ["📈", "📊", "💹", "💰", "💵", "💸", "💲", "📉", "🎯", "📈", "💹"];
  return emojis[Math.floor(Math.random() * emojis.length)]!;
}

/** Generate position along screen edges so we never cover the central content area. */
function generatePosition(): { x: number; y: number } {
  const padding = 8; // avoid hard edges
  const edge = Math.random();

  if (edge < 0.25) {
    // top band
    return {
      x: padding + Math.random() * (100 - 2 * padding),
      y: 12,
    };
  }
  if (edge < 0.5) {
    // bottom band
    return {
      x: padding + Math.random() * (100 - 2 * padding),
      y: 88,
    };
  }
  if (edge < 0.75) {
    // left band
    return {
      x: 6,
      y: padding + Math.random() * (100 - 2 * padding),
    };
  }
  // right band
  return {
    x: 94,
    y: padding + Math.random() * (100 - 2 * padding),
  };
}

export function SalesAnimation() {
  const [items, setItems] = useState<AnimatedItem[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let itemIdCounter = 0;

    const generateItem = (): AnimatedItem => {
      const pos = generatePosition();
      const isEmoji = Math.random() > 0.5;
      return {
        id: ++itemIdCounter,
        content: isEmoji ? getRandomEmoji() : formatAmount(),
        type: isEmoji ? "emoji" : "amount",
        x: pos.x,
        y: pos.y,
      };
    };

    const addItem = () => {
      if (!mountedRef.current) return;
      const newItem = generateItem();
      setItems((prev) => [...prev, newItem]);

      setTimeout(() => {
        if (mountedRef.current) {
          setItems((prev) => prev.filter((item) => item.id !== newItem.id));
        }
      }, 3500);
    };

    intervalRef.current = setInterval(() => {
      if (mountedRef.current && Math.random() > 0.15) {
        addItem();
      }
    }, 400 + Math.random() * 600);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {items.map((item) => (
          <div
            key={item.id}
            className="absolute font-bold text-lg sm:text-xl md:text-2xl"
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              animation: "fade-pop 3s ease-out forwards",
              transform: "translate(-50%, -50%)",
              color: item.type === "amount" ? "#22c55e" : "#ffffff",
              textShadow:
                item.type === "amount"
                  ? "0 0 10px rgba(34, 197, 94, 0.5), 0 0 20px rgba(34, 197, 94, 0.3)"
                  : "0 0 10px rgba(255, 255, 255, 0.4), 0 0 20px rgba(255, 255, 255, 0.2)",
            }}
          >
            {item.content}
          </div>
        ))}
      </div>
      <style jsx global>{`
        @keyframes fade-pop {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.1);
          }
          10% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          70% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.9) translateY(-20px);
          }
        }
      `}</style>
    </>
  );
}
