"use client";

import { useState, useRef, useCallback } from "react";

interface UseTextToSpeechOptions {
  /** Called when audio finishes playing naturally (not when stop() is called). */
  onEnd?: () => void;
}

interface UseTextToSpeechReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
}

export function useTextToSpeech(
  options?: UseTextToSpeechOptions
): UseTextToSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Keep a fresh ref to onEnd so speak() never captures a stale closure
  const onEndRef = useRef(options?.onEnd);
  onEndRef.current = options?.onEnd;

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsSpeaking(false);
    // NOTE: onEnd is intentionally NOT called here — only fires on natural end
  }, []);

  const speak = useCallback(
    async (text: string): Promise<void> => {
      // Cancel anything currently playing
      stop();

      if (!text.trim()) return;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setIsSpeaking(true);

        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          // TTS API failed — skip audio silently so the chat keeps working
          console.warn(
            `[useTextToSpeech] API returned ${response.status} — skipping audio`
          );
          setIsSpeaking(false);
          onEndRef.current?.(); // still fire so mic can re-activate
          return;
        }

        const blob = await response.blob();

        // If stop() was called while fetching, bail without calling onEnd
        if (controller.signal.aborted) return;

        const url = URL.createObjectURL(blob);
        // NOTE: do NOT set audio.preload after construction. new Audio(url) already
        // starts loading the blob immediately. Setting preload afterwards can cause
        // some browsers to reset the media element's ready state, making play()
        // throw a NotSupportedError that silently swallows the audio entirely.
        // Blob URLs have the full data in memory — no preloading is needed.
        const audio = new Audio(url);
        audioRef.current = audio;

        // Resolve (never reject) so a playback hiccup never crashes the app.
        await new Promise<void>((resolve) => {
          audio.onended = () => {
            // 400 ms buffer: ElevenLabs audio can end slightly before the last
            // syllable finishes pushing through the system audio pipeline.
            // The delay gives the speaker time to fully play out the tail
            // before we call onEnd (which would activate the microphone).
            // The aborted check ensures stop() mid-delay doesn't fire onEnd.
            setTimeout(() => {
              if (controller.signal.aborted) return;
              URL.revokeObjectURL(url);
              audioRef.current = null;
              resolve();
            }, 400);
          };

          // onerror: log and move on — the chat must keep working without audio
          audio.onerror = (e) => {
            console.warn("[useTextToSpeech] Audio playback error — skipping:", e);
            URL.revokeObjectURL(url);
            audioRef.current = null;
            resolve();
          };

          // play() can be blocked by autoplay policy — treat as a soft failure
          audio.play().catch((e) => {
            console.warn("[useTextToSpeech] play() blocked — skipping:", e);
            URL.revokeObjectURL(url);
            audioRef.current = null;
            resolve();
          });
        });

        setIsSpeaking(false);
        // Fire onEnd after natural completion so the caller can re-activate the mic
        onEndRef.current?.();
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // Intentional stop() — don't call onEnd
          return;
        }
        // Any other unexpected error: warn, clean up, let the chat continue
        console.warn("[useTextToSpeech] Unexpected error:", err);
        setIsSpeaking(false);
        onEndRef.current?.(); // fire so mic can re-activate
      }
    },
    [stop]
  );

  return { speak, stop, isSpeaking };
}
