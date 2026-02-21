// src/components/chat/MessageBubble.tsx

import { Volume2 } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  role: "cashier" | "customer";
  content: string;
  /** Time the message was sent — displayed below the bubble */
  timestamp?: Date;
  /** True while Alex's TTS audio is playing for this bubble */
  isSpeaking?: boolean;
  /** Callback to replay this message's audio */
  onReplay?: () => void;
}

export function MessageBubble({
  role,
  content,
  timestamp,
  isSpeaking = false,
  onReplay,
}: MessageBubbleProps) {
  const isCashier = role === "cashier";

  return (
    <div
      className={`flex mb-4 animate-slide-up ${
        isCashier ? "justify-start" : "justify-end"
      }`}
    >
      <div
        className={`flex flex-col max-w-[85%] ${
          isCashier ? "items-start" : "items-end"
        }`}
      >
        {/* "Alex" label above every cashier bubble */}
        {isCashier && (
          <span
            className="text-[10px] font-medium mb-1 ml-1 tracking-wide"
            style={{ color: "#9A8A7A" }}
          >
            Alex
          </span>
        )}

        <div
          className={
            isCashier
              ? "bg-white rounded-[20px] rounded-tl-[5px] px-4 py-2.5 text-[14px] shadow-sm leading-relaxed"
              : "rounded-[20px] rounded-tr-[5px] px-4 py-2.5 text-[14px] text-white shadow-sm leading-relaxed"
          }
          style={
            isCashier
              ? { color: "#2C1A12", border: "1px solid #EDE8E0" }
              : { backgroundColor: "#D4943A" }
          }
        >
          {content}

          {/* Speaking indicator + replay — cashier bubbles only */}
          {isCashier && (
            <div className="flex items-center gap-2 mt-1.5">
              {/* Animated sound-wave bars while TTS is playing */}
              {isSpeaking && (
                <div className="flex items-end gap-[3px] h-3">
                  {[0, 80, 160, 240, 320].map((delay, i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full animate-bounce"
                      style={{
                        animationDelay: `${delay}ms`,
                        height: i % 2 === 0 ? "10px" : "6px",
                        backgroundColor: "#D4943A",
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Replay button */}
              {onReplay && (
                <button
                  type="button"
                  onClick={onReplay}
                  aria-label="Replay message"
                  className="ml-auto transition-opacity hover:opacity-70"
                  style={{ color: "#C9B9A9" }}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Timestamp below the bubble */}
        {timestamp && (
          <span
            className="text-xs mt-1 px-1"
            style={{ color: "#2C1A12", opacity: 0.4 }}
          >
            {formatTime(timestamp)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────

interface TypingIndicatorProps {
  visible: boolean;
}

export function TypingIndicator({ visible }: TypingIndicatorProps) {
  if (!visible) return null;
  return (
    <div className="flex justify-start mb-4 animate-slide-up">
      <div className="flex flex-col items-start">
        <span
          className="text-[10px] font-medium mb-1 ml-1 tracking-wide"
          style={{ color: "#9A8A7A" }}
        >
          Alex
        </span>
        <div
          className="bg-white rounded-[20px] rounded-tl-[5px] px-4 py-3 shadow-sm"
          style={{ border: "1px solid #EDE8E0" }}
        >
          <div className="flex items-center gap-1">
            {[0, 150, 300].map((delay, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{
                  animationDelay: `${delay}ms`,
                  backgroundColor: "#C9B9A9",
                }}
              />
            ))}
          </div>
        </div>

        {/* "Alex is typing..." label below the dots */}
        <p
          className="text-xs mt-1 ml-1"
          style={{ color: "#2C1A12", opacity: 0.5 }}
        >
          Alex is typing…
        </p>
      </div>
    </div>
  );
}
