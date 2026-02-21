// src/app/api/tts/route.ts
// POST /api/tts — Text-to-speech via ElevenLabs API
// Returns audio/mpeg stream ready for the browser Audio API

export const dynamic = "force-dynamic";

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — natural, warm, friendly
const MAX_TEXT_LENGTH = 500;

export async function POST(req: Request) {
  // Read the key inside the handler so Next.js doesn't cache the value at
  // module initialisation time (same pattern as the Anthropic key in /api/chat)
  const apiKey = process.env.ELEVENLABS_API_KEY;
  console.log("[/api/tts] ElevenLabs key loaded:", !!apiKey);
  if (!apiKey) {
    console.error("[/api/tts] ELEVENLABS_API_KEY is not set in .env.local");
    return new Response("TTS not configured", { status: 500 });
  }

  let text: string;
  try {
    const body = await req.json();
    text = body.text;
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  if (!text || typeof text !== "string" || !text.trim()) {
    return new Response("text is required", { status: 400 });
  }

  // Truncate to keep latency low and stay within ElevenLabs limits
  const truncated =
    text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;

  // ElevenLabs sometimes clips the very last word without trailing content.
  // Appending a period + two spaces gives the model a natural sentence-end
  // cue so the final phoneme fully renders into the audio stream.
  const trimmedText = truncated.trimEnd();
  const lastChar = trimmedText.slice(-1);
  const hasPunctuation = [".", "!", "?", ",", ";", "…"].includes(lastChar);
  const paddedText = hasPunctuation ? trimmedText + "  " : trimmedText + ".  ";

  try {
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: paddedText,
          model_id: "eleven_monolingual_v1",
        }),
      }
    );

    if (!elevenRes.ok) {
      const errBody = await elevenRes.text();
      console.error(
        "[/api/tts] ElevenLabs error — status:",
        elevenRes.status,
        "body:",
        errBody
      );
      return new Response("TTS service error", { status: 502 });
    }

    const audioBuffer = await elevenRes.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[/api/tts] fetch error:", err);
    return new Response("Internal server error", { status: 500 });
  }
}
