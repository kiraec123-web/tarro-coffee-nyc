"use client";

import React, { useState } from "react";
import { Mic, Send, Keyboard } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  // Voice state — provided by ChatInterface
  voiceMode: boolean;
  onVoiceModeChange: (mode: boolean) => void;
  isListening: boolean;
  transcript: string;
  onStartListening: () => void;
  onStopListening: () => void;
  isSpeechSupported: boolean;
}

export function ChatInput({
  onSend,
  disabled = false,
  voiceMode,
  onVoiceModeChange,
  isListening,
  transcript,
  onStartListening,
  onStopListening,
  isSpeechSupported,
}: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleMicPress = () => {
    if (disabled) return;
    if (isListening) {
      onStopListening();
    } else {
      onStartListening();
    }
  };

  // ── Voice mode (default) ────────────────────────────────────────────────────
  if (voiceMode) {
    return (
      <div
        className="shrink-0 bg-white border-t border-stone-200 px-4 pt-5"
        style={{ paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}
      >
        {/* Interim transcript — visible as user speaks */}
        <div
          className={`mb-3 min-h-[20px] text-center text-sm text-stone-500 italic px-6 transition-opacity duration-200 ${
            transcript ? "opacity-100" : "opacity-0"
          }`}
        >
          {transcript || "…"}
        </div>

        {/* Mic button — hero element, centered */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex items-center justify-center">
            {/* Animated rings while listening */}
            {isListening && (
              <>
                <span className="absolute w-20 h-20 rounded-full bg-red-400 opacity-20 animate-ping" />
                <span className="absolute w-16 h-16 rounded-full bg-red-400 opacity-25 animate-pulse" />
              </>
            )}

            <button
              type="button"
              onClick={handleMicPress}
              disabled={disabled}
              aria-label={isListening ? "Stop listening" : "Tap to talk"}
              className={`relative z-10 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-200 active:scale-95 ${
                isListening
                  ? "bg-red-500 scale-110"
                  : "hover:opacity-90"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              style={isListening ? undefined : { backgroundColor: "#D4943A" }}
            >
              <Mic className="w-6 h-6 text-white" />
            </button>
          </div>

          <span
            className={`text-xs font-medium tracking-wide transition-colors duration-200 ${
              isListening ? "text-red-500" : "text-stone-400"
            }`}
          >
            {isListening ? "Listening…" : "Tap to talk"}
          </span>

          {/* Switch to text — subtle link below the mic */}
          <button
            type="button"
            onClick={() => onVoiceModeChange(false)}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            <Keyboard className="w-3.5 h-3.5" />
            Switch to typing
          </button>
        </div>
      </div>
    );
  }

  // ── Text mode (fallback) ────────────────────────────────────────────────────
  return (
    <div
      className="shrink-0 bg-white border-t border-stone-200 px-4 pt-3"
      style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      {/* Input row */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={disabled}
          placeholder={disabled ? "Alex is typing…" : "Type your order…"}
          className="flex-1 h-11 px-4 bg-white border border-stone-200 rounded-full text-sm outline-none focus:ring-2 focus:border-transparent disabled:bg-stone-50 disabled:cursor-not-allowed"
          style={
            {
              color: "#2C1A12",
              "--tw-ring-color": "#D4943A",
            } as React.CSSProperties
          }
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          aria-label="Send message"
          className="flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-[14px] disabled:opacity-40 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "#D4943A" }}
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Switch to voice — mirrors the "Switch to typing" link in voice mode */}
      {isSpeechSupported && (
        <div className="flex justify-center mt-3">
          <button
            type="button"
            onClick={() => onVoiceModeChange(true)}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            <Mic className="w-3.5 h-3.5" />
            Switch to voice
          </button>
        </div>
      )}
    </div>
  );
}
