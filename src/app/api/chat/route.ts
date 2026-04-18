import { NextRequest } from 'next/server';
import { GoogleGenAI, type FunctionDeclaration, type Content } from '@google/genai';
import { SYSTEM_PROMPT, TRIP_PLAN_FUNCTION_DECLARATION, formatTripSnapshot, type CurrentTripSnapshot } from '@/lib/chatTools';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(request: NextRequest) {
  const { messages, currentTrip } = await request.json() as {
    messages: Array<{ role: 'user' | 'assistant'; content: string; functionCall?: string; functionCallArgs?: unknown }>;
    currentTrip?: CurrentTripSnapshot | null;
  };

  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  // Build Gemini conversation history
  const geminiContents: Content[] = [];

  for (const m of messages) {
    if (m.role === 'user') {
      geminiContents.push({ role: 'user', parts: [{ text: m.content }] });
    } else if (m.role === 'assistant') {
      if (m.functionCall) {
        // Include the function call + synthetic response so Gemini has context
        const parts: Content['parts'] = [];
        if (m.content) parts.push({ text: m.content });
        parts.push({ functionCall: { name: m.functionCall, args: (m.functionCallArgs as Record<string, unknown>) || {} } });
        geminiContents.push({ role: 'model', parts });
        geminiContents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: m.functionCall,
              response: { result: 'Plan shown to user. They can accept, request changes, or keep chatting.' },
            },
          }],
        });
      } else {
        geminiContents.push({ role: 'model', parts: [{ text: m.content || '...' }] });
      }
    }
  }

  try {
    const systemInstruction = currentTrip
      ? `${SYSTEM_PROMPT}\n\n---\n${formatTripSnapshot(currentTrip)}`
      : SYSTEM_PROMPT;

    const response = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: geminiContents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [TRIP_PLAN_FUNCTION_DECLARATION as FunctionDeclaration] }],
      },
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const candidate = chunk.candidates?.[0];
            if (!candidate?.content?.parts) continue;

            for (const part of candidate.content.parts) {
              if (part.text) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'text_delta', text: part.text })}\n\n`)
                );
              } else if (part.functionCall) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'function_call',
                    name: part.functionCall.name,
                    args: part.functionCall.args,
                  })}\n\n`)
                );
              }
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        } catch (err) {
          console.error('Stream error:', err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed. Please try again.' })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (err) {
    console.error('Chat error:', err);
    const status = (err as { status?: number }).status;
    return Response.json(
      { error: status === 429 ? 'Rate limit hit, wait a moment.' : 'Failed to get response.' },
      { status: status || 500 }
    );
  }
}
