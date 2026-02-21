// src/app/api/chat/route.ts
// ============================================================
// POST /api/chat
// Accepts conversation history, calls Claude with streaming,
// and pipes the response back to the client as plain text.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/system-prompt";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  let messages: { role: "user" | "assistant"; content: string }[];

  try {
    const body = await req.json();
    messages = body.messages;
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("messages array is required", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = client.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: buildSystemPrompt(),
          messages,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        console.error("[/api/chat] Anthropic error:", err);
        controller.enqueue(
          encoder.encode(
            "\n\nSorry, I'm having trouble right now. Please try again."
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // disable Nginx buffering on Vercel
    },
  });
}
