# Tarro Coffee NYC — AI Voice Cashier

## Build Status

### Completed
- [x] **Ticket 1**: Customer chat UI shell — layout and components only, no AI/voice wiring
  - `src/app/customer/page.tsx`
  - `src/components/chat/ChatInterface.tsx`
  - `src/components/chat/MessageBubble.tsx`
  - `src/components/chat/ChatInput.tsx`

### Pending
- [ ] AI wiring (Claude API integration, multi-turn conversation)
- [ ] Voice input/output (ElevenLabs STT/TTS)
- [ ] Order receipt component
- [ ] Barista view — order ticket queue with In Progress / Completed states
- [ ] Owner dashboard — data metrics
- [ ] Database integration (Supabase — persistent orders across sessions)
- [ ] Menu modal ("View Menu" button)

## Tech Stack
- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS v4
- **Icons**: lucide-react
- **Fonts**: DM Sans (body), DM Serif Display (wordmark)
- **Database**: Supabase (planned)
- **LLM**: Claude API (planned)
- **Voice**: ElevenLabs (planned)
- **Hosting**: Vercel (planned)
