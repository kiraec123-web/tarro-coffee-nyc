"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Coffee, Menu, Mic, Volume2, VolumeX } from "lucide-react";
import { MessageBubble, TypingIndicator } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { ReceiptCard } from "./ReceiptCard";
import { MenuDrawer } from "./MenuDrawer";
import { saveOrder, updateOrder, type OrderReceipt } from "@/lib/order-service";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";

// ---- Types ----

type ChatMessage = {
  id: string;
  role: "cashier" | "customer";
  /** Text shown in the UI (receipt JSON is stripped out) */
  content: string;
  /**
   * Original raw content including the JSON block.
   * Used to reconstruct accurate API history after a receipt is generated.
   */
  rawContent?: string;
  receipt?: OrderReceipt;
  orderNumber?: number;
  /** Supabase order UUID — passed to ReceiptCard for realtime status */
  orderId?: string;
  /** When the message was created — shown as a timestamp below the bubble */
  timestamp: Date;
};

type ApiMessage = { role: "user" | "assistant"; content: string };

// ---- Constants ----

const GREETING_TEXT =
  "Hey there! I'm Alex, your cashier at NYC Coffee. You can check out our menu with the 'View Menu' button above, or just tell me what you're in the mood for — I'm happy to help you pick something out!";

function makeGreeting(): ChatMessage {
  return {
    id: "greeting",
    role: "cashier",
    content: GREETING_TEXT,
    timestamp: new Date(),
  };
}

// Regex to detect and extract the JSON receipt block the AI emits.
const RECEIPT_REGEX = /```json\s*(\{[\s\S]*?\})\s*```/;

// ---- Helpers ----

/**
 * Parses an order receipt block (order_complete or order_update) from
 * the AI response text. Returns null if no valid block is found.
 */
function parseReceipt(text: string): OrderReceipt | null {
  const match = text.match(RECEIPT_REGEX);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]) as OrderReceipt;
    if (
      (data.type === "order_complete" || data.type === "order_update") &&
      Array.isArray(data.items)
    ) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function stripReceiptBlock(text: string): string {
  return text.replace(RECEIPT_REGEX, "").trim();
}

/**
 * Converts internal ChatMessage history to the API format.
 * - Excludes the hardcoded greeting (shown in UI only).
 * - For receipt messages, uses rawContent so the AI sees the original JSON.
 * - Ensures the array starts with a user message (Anthropic requirement).
 */
function toApiMessages(messages: ChatMessage[]): ApiMessage[] {
  const mapped = messages
    .filter((m) => m.id !== "greeting")
    .map((m) => ({
      role: (m.role === "cashier" ? "assistant" : "user") as
        | "user"
        | "assistant",
      content: m.rawContent ?? m.content,
    }));

  while (mapped.length > 0 && mapped[0].role === "assistant") {
    mapped.shift();
  }

  return mapped;
}

// ---- Component ----

export function ChatInterface() {
  // ── Bug 1: Hydration guard ────────────────────────────────────────────────────
  // This component uses browser APIs (SpeechRecognition, AudioContext) that
  // don't exist on the server. Rendering different JSX on server vs client
  // causes a hydration mismatch. Solution: return a neutral placeholder until
  // the component has mounted on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    makeGreeting(),
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Splash / first-interaction gate ──────────────────────────────────────────
  /**
   * Browsers block audio until the user has interacted with the page.
   * We show a splash screen until the first tap so every subsequent
   * TTS call is guaranteed to be unblocked by autoplay policy.
   */
  const [hasStarted, setHasStarted] = useState(false);

  // ── Voice / TTS state ────────────────────────────────────────────────────────
  /** true = mic is primary + TTS auto-plays; false = text input is primary */
  const [voiceMode, setVoiceMode] = useState(true);
  /** When muted, TTS doesn't auto-play; voice input still works */
  const [isMuted, setIsMuted] = useState(false);
  /** ID of the message whose TTS audio is currently playing */
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // ── Mic glow feedback ─────────────────────────────────────────────────────────
  /** Briefly true when mic activates — drives a gold inset ring on the wrapper */
  const [micGlowing, setMicGlowing] = useState(false);

  // Refs so async closures always read the latest values without stale state
  const voiceModeRef = useRef(true);
  const isMutedRef = useRef(false);
  const isRespondingRef = useRef(false);
  /**
   * Set to true when a receipt is shown — tells onTtsEnd NOT to re-activate
   * the mic. The order is done; no more back-and-forth needed.
   */
  const orderCompleteRef = useRef(false);
  /**
   * Bug 3 timing fix: if TTS audio ends while the Claude stream is still open
   * (because we fired TTS early at ~100 chars), onTtsEnd can't start the mic
   * (isRespondingRef is still true). We park the intent here and pick it up
   * in the `finally` block once streaming ends.
   */
  const ttsEndedWhileRespondingRef = useRef(false);

  /**
   * Tracks the Supabase UUID of the order currently being modified.
   * Set when the customer taps "Modify order"; cleared after order_update is handled.
   */
  const modifyingOrderIdRef = useRef<string | null>(null);
  /**
   * The ChatMessage ID of the receipt card being modified.
   * Used to find and update the existing receipt in state.
   */
  const modifyingReceiptMsgIdRef = useRef<string | null>(null);

  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── 5-second silence safety timer for auto-listen ────────────────────────────
  const autoListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAutoListenTimer = useCallback(() => {
    if (autoListenTimerRef.current !== null) {
      clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
  }, []);

  // ── TTS hook refs ─────────────────────────────────────────────────────────────
  const startListeningRef = useRef<() => void>(() => {});
  const stopListeningRef  = useRef<() => void>(() => {});

  /** Shared logic: start the mic and arm the 5-second silence guard. */
  const activateMic = useCallback(() => {
    clearAutoListenTimer();
    startListeningRef.current();
    autoListenTimerRef.current = setTimeout(() => {
      stopListeningRef.current();
    }, 5000);
  }, [clearAutoListenTimer]);

  const onTtsEnd = useCallback(() => {
    // Don't auto-listen after order is complete (receipt shown)
    if (orderCompleteRef.current) return;
    if (!voiceModeRef.current || isMutedRef.current) return;

    if (isRespondingRef.current) {
      // Bug 3: Claude is still streaming. Park the intent — the `finally`
      // block in handleSend will pick this up when streaming finishes.
      ttsEndedWhileRespondingRef.current = true;
      return;
    }

    activateMic();
  }, [activateMic]);

  const { speak, stop, isSpeaking } = useTextToSpeech({ onEnd: onTtsEnd });

  /**
   * Speak a specific message and track which bubble is "talking".
   * Uses functional setSpeakingMessageId to avoid race conditions.
   */
  const speakMessage = useCallback(
    async (messageId: string, text: string) => {
      setSpeakingMessageId(messageId);
      await speak(text);
      setSpeakingMessageId((current) =>
        current === messageId ? null : current
      );
    },
    [speak]
  );

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ── Splash "begin" handlers ───────────────────────────────────────────────────
  const handleBegin = useCallback(() => {
    setHasStarted(true);
    // Inside a click handler → browser allows audio from here on
    speakMessage("greeting", GREETING_TEXT).catch(() => {});
  }, [speakMessage]);

  const handleBeginText = useCallback(() => {
    setHasStarted(true);
    setVoiceMode(false);
  }, []);

  // ── Reset ────────────────────────────────────────────────────────────────────
  const handleNewOrder = useCallback(() => {
    clearAutoListenTimer();
    stop();
    setSpeakingMessageId(null);
    orderCompleteRef.current = false;
    ttsEndedWhileRespondingRef.current = false;
    modifyingOrderIdRef.current = null;
    modifyingReceiptMsgIdRef.current = null;
    setMessages([makeGreeting()]);
    setIsTyping(false);
    setIsResponding(false);
    isRespondingRef.current = false;
    // User has already interacted — TTS is unblocked; play fresh greeting
    speakMessage("greeting", GREETING_TEXT).catch(() => {});
  }, [stop, clearAutoListenTimer, speakMessage]);

  // ── Modify order handler ──────────────────────────────────────────────────────
  /**
   * Called when the customer taps "Modify order" on the receipt card.
   * Reopens the conversation, injects a cashier "Sure, what would you like to change?"
   * message, and activates the mic / TTS.
   */
  const handleModifyOrder = useCallback(
    (receiptMsgId: string, orderId: string) => {
      // Reopen the order flow
      orderCompleteRef.current = false;
      ttsEndedWhileRespondingRef.current = false;
      modifyingOrderIdRef.current = orderId;
      modifyingReceiptMsgIdRef.current = receiptMsgId;

      const modMsg: ChatMessage = {
        id: `cashier-${Date.now()}`,
        role: "cashier",
        content: "Sure, what would you like to change?",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, modMsg]);
      // onTtsEnd will activate the mic after TTS finishes (since orderCompleteRef is now false)
      speakMessage(modMsg.id, modMsg.content).catch(() => {});
    },
    [speakMessage]
  );

  // ── Main send handler ────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text: string) => {
      clearAutoListenTimer();
      stop();
      setSpeakingMessageId(null);
      // Reset the deferred-listen flag for this new turn
      ttsEndedWhileRespondingRef.current = false;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "customer",
        content: text,
        timestamp: new Date(),
      };

      const historySnapshot = [...messages, userMsg];

      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);
      setIsResponding(true);
      isRespondingRef.current = true;

      const apiMessages = toApiMessages(historySnapshot);

      // Bug 3: track whether TTS has already been triggered during streaming
      let ttsStarted = false;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });

        if (!response.ok) throw new Error(`API returned ${response.status}`);
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let streamingId: string | null = null;
        const streamingTimestamp = new Date();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk;

          if (!streamingId) {
            streamingId = `cashier-${Date.now()}`;
            setIsTyping(false);
            setMessages((prev) => [
              ...prev,
              {
                id: streamingId!,
                role: "cashier",
                content: fullContent,
                timestamp: streamingTimestamp,
              },
            ]);
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId ? { ...m, content: fullContent } : m
              )
            );
          }

          // Bug 3: fire TTS as soon as ~100 chars have accumulated so that
          // audio and text start at roughly the same time rather than waiting
          // for the entire response to finish streaming first.
          if (
            !ttsStarted &&
            streamingId &&
            voiceModeRef.current &&
            !isMutedRef.current &&
            fullContent.length >= 100
          ) {
            ttsStarted = true;
            const earlyText = stripReceiptBlock(fullContent).trim();
            if (earlyText) {
              // Fire-and-forget: don't await so streaming continues in parallel
              speakMessage(streamingId, earlyText);
            }
          }
        }

        if (!streamingId) {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `cashier-${Date.now()}`,
              role: "cashier",
              content: "Sorry about that — could you repeat your order?",
              timestamp: new Date(),
            },
          ]);
          return;
        }

        // ── Receipt handling ──────────────────────────────────────────────────
        const receipt = parseReceipt(fullContent);
        const displayContent = receipt
          ? stripReceiptBlock(fullContent)
          : fullContent;

        if (receipt?.type === "order_update" &&
            modifyingOrderIdRef.current &&
            modifyingReceiptMsgIdRef.current) {
          // ── UPDATE existing order in Supabase ─────────────────────────────
          const savedModReceiptMsgId = modifyingReceiptMsgIdRef.current;

          try {
            await updateOrder(
              modifyingOrderIdRef.current,
              receipt.items,
              receipt.total_price
            );
          } catch (err) {
            console.error("[ChatInterface] updateOrder failed:", err);
          }

          // Clear modification state + lock out auto-listen
          modifyingOrderIdRef.current = null;
          modifyingReceiptMsgIdRef.current = null;
          orderCompleteRef.current = true;
          clearAutoListenTimer();
          stopListeningRef.current();

          // Update both: the streaming confirmation text AND the existing receipt card
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === streamingId) {
                return { ...m, content: displayContent, rawContent: fullContent };
              }
              if (m.id === savedModReceiptMsgId) {
                return { ...m, receipt };
              }
              return m;
            })
          );
        } else if (receipt?.type === "order_complete") {
          // ── SAVE new order to Supabase ────────────────────────────────────
          let orderNumber = 0;
          let savedOrderId: string | undefined;
          try {
            const saved = await saveOrder(receipt);
            orderNumber = saved.order_number;
            savedOrderId = saved.id;
          } catch (err) {
            console.error("[ChatInterface] saveOrder failed:", err);
          }

          // Order complete — stop listening and lock out auto-listen
          orderCompleteRef.current = true;
          clearAutoListenTimer();
          stopListeningRef.current();

          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingId
                ? {
                    ...m,
                    content: displayContent,
                    rawContent: fullContent,
                    receipt,
                    orderNumber,
                    orderId: savedOrderId,
                  }
                : m
            )
          );
        }

        // ── TTS: fire after streaming only if NOT already started early ───────
        const ttsText = displayContent.trim();
        if (!ttsStarted && voiceModeRef.current && !isMutedRef.current && ttsText) {
          speakMessage(streamingId, ttsText);
        }
      } catch (err) {
        console.error("[ChatInterface] handleSend error:", err);
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "cashier",
            content:
              "Something went wrong on my end. Give me a second and try again.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsResponding(false);
        isRespondingRef.current = false;
        setIsTyping(false);

        // Bug 3 timing fix: if TTS ended before streaming finished, onTtsEnd
        // returned early (isRespondingRef was true). Now that streaming is done,
        // honour the deferred intent and start the mic.
        if (
          ttsEndedWhileRespondingRef.current &&
          voiceModeRef.current &&
          !isMutedRef.current &&
          !orderCompleteRef.current
        ) {
          ttsEndedWhileRespondingRef.current = false;
          activateMic();
        }
      }
    },
    [messages, speakMessage, stop, clearAutoListenTimer, activateMic]
  );

  // ── Menu item selection ───────────────────────────────────────────────────────
  const handleSelectItem = useCallback(
    (name: string) => {
      setMenuOpen(false);
      handleSend(`I'd like a ${name}`);
    },
    [handleSend]
  );

  // ── Speech recognition ───────────────────────────────────────────────────────
  const onFinalSpeech = useCallback(
    (text: string) => {
      if (!isResponding && text.trim()) {
        handleSend(text);
      }
    },
    [handleSend, isResponding]
  );

  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    isSupported,
  } = useSpeechRecognition(onFinalSpeech);

  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);
  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);

  const handleStartListening = useCallback(() => {
    clearAutoListenTimer();
    stop();
    setSpeakingMessageId(null);
    startListening();

    // Flash amber glow ring around the chat area for 300 ms
    setMicGlowing(true);
    setTimeout(() => setMicGlowing(false), 300);
  }, [stop, startListening, clearAutoListenTimer]);

  useEffect(() => {
    if (!isSupported) setVoiceMode(false);
  }, [isSupported]);

  // ── Bug 1: SSR placeholder ────────────────────────────────────────────────────
  // Return a static, browser-agnostic shell until the component has hydrated.
  // This eliminates the server/client mismatch that causes hydration errors.
  if (!mounted) {
    return <div className="h-[100dvh]" style={{ backgroundColor: "#1C1210" }} />;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative flex flex-col h-[100dvh] overflow-hidden"
      style={{
        backgroundColor: "#FAF7F2",
        // Amber glow ring — inset so it stays within the viewport bounds
        boxShadow: micGlowing
          ? "inset 0 0 0 2px #D4943A"
          : "inset 0 0 0 0px transparent",
        transition: "box-shadow 300ms ease-out",
      }}
    >
      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelectItem={handleSelectItem}
      />

      {/* ── Welcome / splash overlay ───────────────────────────────────────────
          Shown until the user's first tap. The click handler counts as a browser
          user-gesture so all future TTS calls are unblocked by autoplay policy.
          Fades out (opacity-0 + pointer-events-none) instead of unmounting so
          the transition is smooth and no DOM flicker occurs. */}
      <div
        className={`absolute inset-0 z-30 flex flex-col items-center justify-center px-8 transition-opacity duration-500 ${
          hasStarted ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        style={{
          background: "linear-gradient(to bottom, #1C1210, #3B2418)",
        }}
      >
        {/* Logo / wordmark */}
        <div className="flex items-center gap-2.5 mb-2">
          <Coffee className="w-6 h-6" style={{ color: "#D4943A" }} />
          <span
            className="font-serif-display text-3xl leading-none"
            style={{ color: "#FAF3E8" }}
          >
            NYC Coffee
          </span>
        </div>

        {/* Address */}
        <p
          className="text-[11px] tracking-widest uppercase mb-10"
          style={{ color: "#9A8A7A" }}
        >
          512 West 43rd Street, New York
        </p>

        {/* Tagline */}
        <p
          className="font-serif-display text-[17px] text-center mb-3 leading-snug"
          style={{ color: "#FAF3E8" }}
        >
          Great coffee starts with a conversation.
        </p>
        <p
          className="text-[13px] text-center mb-10 leading-relaxed max-w-[280px]"
          style={{ color: "#9A8A7A" }}
        >
          Meet Alex, your virtual barista. Just tap below and order like you
          would at the counter — or browse the menu first.
        </p>

        {/* Primary CTA — voice */}
        {isSupported && (
          <button
            type="button"
            onClick={handleBegin}
            className="flex items-center gap-2.5 px-8 py-4 rounded-full text-base font-semibold shadow-lg active:scale-95 transition-all hover:opacity-90"
            style={{ backgroundColor: "#D4943A", color: "#FFFFFF" }}
          >
            <Mic className="w-5 h-5" />
            Start your order
          </button>
        )}

        {/* Secondary CTA — text */}
        <button
          type="button"
          onClick={handleBeginText}
          className={
            isSupported
              ? "mt-5 text-[12px] transition-opacity hover:opacity-70"
              : "flex items-center gap-2 px-8 py-4 rounded-full text-base font-semibold shadow-lg active:scale-95 transition-all hover:opacity-90"
          }
          style={
            isSupported
              ? { color: "#9A8A7A" }
              : { backgroundColor: "#D4943A", color: "#FFFFFF" }
          }
        >
          {isSupported ? "or type instead →" : "Start ordering"}
        </button>
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: "#1C1210",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Coffee className="w-5 h-5" style={{ color: "#D4943A" }} />
            <span
              className="font-serif-display text-xl leading-none"
              style={{ color: "#FAF3E8" }}
            >
              NYC Coffee
            </span>
          </div>
          <Link
            href="/barista"
            className="text-xs transition-opacity hover:opacity-80"
            style={{ color: "#FAF3E8", opacity: 0.4 }}
          >
            Barista View →
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* Mute toggle */}
          <button
            type="button"
            onClick={() => {
              if (!isMuted) stop();
              setIsMuted((m) => !m);
            }}
            aria-label={isMuted ? "Unmute Alex" : "Mute Alex"}
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-opacity hover:opacity-70"
            style={{ color: "#FAF3E8", opacity: 0.6 }}
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>

          {/* View Menu */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "rgba(255,255,255,0.1)",
              color: "#FAF3E8",
            }}
          >
            <Menu className="w-4 h-4" />
            View Menu
          </button>
        </div>
      </header>

      {/* ── Messages scroll area ────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto min-h-0 px-4 py-4"
        style={{ backgroundColor: "#FAF7F2" }}
      >
        {messages.map((msg) => {
          if (msg.receipt) {
            return (
              <div key={msg.id}>
                {msg.content.length > 0 && (
                  <MessageBubble
                    role="cashier"
                    content={msg.content}
                    timestamp={msg.timestamp}
                    isSpeaking={speakingMessageId === msg.id && isSpeaking}
                    onReplay={
                      voiceMode && !isMuted
                        ? () => speakMessage(msg.id, msg.content)
                        : undefined
                    }
                  />
                )}
                <div className="flex justify-start mb-4">
                  <ReceiptCard
                    receipt={msg.receipt}
                    orderNumber={msg.orderNumber ?? 0}
                    orderId={msg.orderId}
                    onNewOrder={handleNewOrder}
                    onModifyOrder={
                      msg.orderId
                        ? () => handleModifyOrder(msg.id, msg.orderId!)
                        : undefined
                    }
                  />
                </div>
              </div>
            );
          }

          return (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              isSpeaking={speakingMessageId === msg.id && isSpeaking}
              onReplay={
                msg.role === "cashier" && voiceMode && !isMuted
                  ? () => speakMessage(msg.id, msg.content)
                  : undefined
              }
            />
          );
        })}

        <TypingIndicator visible={isTyping} />
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <ChatInput
        onSend={handleSend}
        disabled={isResponding}
        voiceMode={voiceMode}
        onVoiceModeChange={setVoiceMode}
        isListening={isListening}
        transcript={transcript}
        onStartListening={handleStartListening}
        onStopListening={stopListening}
        isSpeechSupported={isSupported}
      />
    </div>
  );
}
