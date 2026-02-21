import Link from "next/link";
import { Coffee, Mic, ClipboardList, BarChart3 } from "lucide-react";

export default function Home() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ backgroundColor: "#1C1210" }}
    >
      {/* ── Logo ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-2">
        <Coffee className="w-9 h-9" style={{ color: "#D4943A" }} />
        <span
          className="font-serif-display text-5xl leading-none"
          style={{ color: "#FAF3E8" }}
        >
          NYC Coffee
        </span>
      </div>

      {/* ── Address ──────────────────────────────────────────────────────────── */}
      <p
        className="text-[11px] tracking-widest uppercase mt-2 mb-3"
        style={{ color: "#9A8A7A" }}
      >
        512 West 43rd Street, New York
      </p>

      {/* ── Tagline ──────────────────────────────────────────────────────────── */}
      <p
        className="text-sm mb-12"
        style={{ color: "#FAF3E8", opacity: 0.55 }}
      >
        AI-Powered Voice Ordering
      </p>

      {/* ── Navigation cards ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 w-full max-w-[400px]">

        {/* Customer */}
        <Link
          href="/customer"
          className="bg-white rounded-xl px-5 py-4 flex items-center gap-4 card-shadow transition-transform duration-150 hover:scale-[1.02]"
        >
          <div
            className="flex items-center justify-center w-11 h-11 rounded-lg shrink-0"
            style={{ backgroundColor: "rgba(212,148,58,0.12)" }}
          >
            <Mic className="w-5 h-5" style={{ color: "#D4943A" }} />
          </div>
          <div className="min-w-0">
            <p
              className="font-semibold text-base leading-tight"
              style={{ color: "#2C1A12" }}
            >
              Place an Order
            </p>
            <p
              className="text-sm mt-0.5 leading-snug"
              style={{ color: "#9A8A7A" }}
            >
              Order by voice or text with Alex, your AI barista
            </p>
          </div>
        </Link>

        {/* Barista */}
        <Link
          href="/barista"
          className="bg-white rounded-xl px-5 py-4 flex items-center gap-4 card-shadow transition-transform duration-150 hover:scale-[1.02]"
        >
          <div
            className="flex items-center justify-center w-11 h-11 rounded-lg shrink-0"
            style={{ backgroundColor: "rgba(107,45,18,0.10)" }}
          >
            <ClipboardList className="w-5 h-5" style={{ color: "#6B2D12" }} />
          </div>
          <div className="min-w-0">
            <p
              className="font-semibold text-base leading-tight"
              style={{ color: "#2C1A12" }}
            >
              Barista Queue
            </p>
            <p
              className="text-sm mt-0.5 leading-snug"
              style={{ color: "#9A8A7A" }}
            >
              View and manage incoming order tickets
            </p>
          </div>
        </Link>

        {/* Owner */}
        <Link
          href="/owner"
          className="bg-white rounded-xl px-5 py-4 flex items-center gap-4 card-shadow transition-transform duration-150 hover:scale-[1.02]"
        >
          <div
            className="flex items-center justify-center w-11 h-11 rounded-lg shrink-0"
            style={{ backgroundColor: "rgba(44,26,18,0.08)" }}
          >
            <BarChart3 className="w-5 h-5" style={{ color: "#2C1A12" }} />
          </div>
          <div className="min-w-0">
            <p
              className="font-semibold text-base leading-tight"
              style={{ color: "#2C1A12" }}
            >
              Dashboard
            </p>
            <p
              className="text-sm mt-0.5 leading-snug"
              style={{ color: "#9A8A7A" }}
            >
              Daily business metrics and insights
            </p>
          </div>
        </Link>

      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <p
        className="text-xs mt-12 text-center"
        style={{ color: "#9A8A7A", opacity: 0.55 }}
      >
        Built with Next.js, Claude AI, ElevenLabs, and Supabase
      </p>
    </div>
  );
}
