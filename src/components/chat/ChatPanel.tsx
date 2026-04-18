'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send, Compass, User, Loader2, Rocket, AlertCircle, Clock, MapPin, RotateCcw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import useChatStore from '@/stores/chatStore';
import type { ChatMessage } from '@/stores/chatStore';
import type { TripPlanData } from '@/lib/tripBuilder';
import { getSegmentColor } from '@/lib/colors';

export default function ChatPanel() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const currentPlan = useChatStore((s) => s.currentPlan);
  const isBuilding = useChatStore((s) => s.isBuilding);
  const buildError = useChatStore((s) => s.buildError);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const buildTrip = useChatStore((s) => s.buildTrip);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleBuild = async () => {
    const success = await buildTrip();
    if (success) router.push('/');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-3">
        {messages.length === 0 && <EmptyState />}

        {messages.map((msg, i) => {
          // Suppress the trailing empty assistant bubble while streaming —
          // the Thinking indicator below already renders the avatar.
          const isTrailingEmpty =
            isStreaming &&
            i === messages.length - 1 &&
            msg.role === 'assistant' &&
            !msg.content &&
            !msg.tripPlan;
          if (isTrailingEmpty) return null;
          return <MessageBubble key={msg.id} message={msg} />;
        })}

        {/* Streaming indicator */}
        {isStreaming && messages.length > 0 && messages[messages.length - 1].content === '' && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-sm shrink-0 flex items-center justify-center mt-0.5 bg-info/10 border border-info/20">
              <Loader2 size={12} className="animate-spin text-info" />
            </div>
            <div className="flex items-center text-dim text-[12px] min-h-[24px]">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Build Trip bar — shows when a plan exists */}
      {currentPlan && (
        <div className="shrink-0 px-4 py-2.5 border-t border-white/[0.04] bg-info/[0.03]">
          {buildError && (
            <div className="flex items-center gap-2 text-[11px] text-danger mb-2">
              <AlertCircle size={11} />
              {buildError}
            </div>
          )}
          <button
            onClick={handleBuild}
            disabled={isBuilding}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm bg-info text-white text-[13px] font-semibold hover:bg-info/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isBuilding ? (
              <><Loader2 size={14} className="animate-spin" /> Building trip...</>
            ) : (
              <><Rocket size={14} /> Build Trip — {currentPlan.stops.length} stops</>
            )}
          </button>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 px-4 pb-3 pt-2 border-t border-white/[0.04]">
        <div className="flex items-end gap-2 bg-white/[0.03] border border-white/[0.06] rounded-sm px-3 py-2 focus-within:border-info/30 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your trip..."
            rows={1}
            className="flex-1 bg-transparent text-[13px] text-primary placeholder-dim resize-none outline-none min-h-[24px] max-h-[120px]"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-sm bg-info text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-info/90 transition-colors"
          >
            <Send size={13} />
          </button>
        </div>

        <div className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-[1.45] text-dim">
          <AlertCircle size={11} className="shrink-0 mt-[2px] text-muted" />
          <p>
            <span className="text-muted">Tip —</span> for best results, draft your
            itinerary with a dedicated AI (ChatGPT, Claude, Gemini) or your own
            research first. This chatbot can sketch plans, but it&apos;s not the
            strongest planner. Once your plan is vetted, paste it here to visualize
            it on the map.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-10 h-10 rounded-sm bg-info/10 border border-info/20 flex items-center justify-center mb-3">
        <Compass size={20} className="text-info" />
      </div>
      <h3 className="text-heading text-[15px] font-semibold mb-1">Plan Your Trip</h3>
      <p className="text-[13px] text-dim max-w-[280px] leading-relaxed">
        Tell me where you want to go. I'll help you build a detailed itinerary with stops, routes, and timing.
      </p>
      <div className="mt-4 space-y-1.5 text-[11px] text-dim">
        <p>"3-day road trip from LA to Joshua Tree"</p>
        <p>"Weekend getaway from SF to Big Sur"</p>
        <p>"2 days in Scotland — Edinburgh and Glasgow"</p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-6 h-6 rounded-sm shrink-0 flex items-center justify-center mt-0.5 ${
        isUser ? 'bg-white/[0.06]' : 'bg-info/10 border border-info/20'
      }`}>
        {isUser ? <User size={12} className="text-muted" /> : <Compass size={12} className="text-info" />}
      </div>

      <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
        {message.content && (
          <div className={`inline-block max-w-[90%] px-3 py-2 rounded-sm text-[13px] leading-relaxed ${
            isUser
              ? 'bg-info/10 text-primary border border-info/15 text-left'
              : 'text-primary'
          }`}>
            {isUser ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              <MarkdownBody content={message.content} />
            )}
          </div>
        )}

        {message.tripPlan && (
          <div className="mt-2 max-w-[90%]">
            <PlanCard plan={message.tripPlan} />
          </div>
        )}
      </div>
    </div>
  );
}

function MarkdownBody({ content }: { content: string }) {
  return (
    <div className="space-y-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="text-heading font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic text-primary">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1">{children}</ol>,
          li: ({ children }) => <li className="leading-snug">{children}</li>,
          h1: ({ children }) => <h3 className="text-heading font-semibold text-[14px] mt-2">{children}</h3>,
          h2: ({ children }) => <h3 className="text-heading font-semibold text-[14px] mt-2">{children}</h3>,
          h3: ({ children }) => <h3 className="text-heading font-semibold text-[13px] mt-2">{children}</h3>,
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded-sm bg-white/[0.06] text-info font-mono text-[12px]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="p-2 rounded-sm bg-white/[0.04] border border-white/[0.04] text-[12px] font-mono overflow-x-auto my-2">
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-info hover:underline"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/10 pl-2 text-muted italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-white/[0.06] my-2" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function PlanCard({ plan }: { plan: TripPlanData }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-white/[0.04]">
        <h4 className="text-heading text-[13px] font-semibold">{plan.title}</h4>
        <p className="text-[11px] text-dim mt-0.5">{plan.description}</p>
        <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-dim">
          <span>{plan.start_date} to {plan.end_date}</span>
          <span>·</span>
          <span className="flex items-center gap-0.5"><MapPin size={9} />{plan.stops.length} stops</span>
        </div>
      </div>
      <div className="px-3 py-2 max-h-[200px] overflow-y-auto space-y-0.5">
        {plan.stops.map((stop, i) => {
          const seg = { type: 'stop' as const, category: stop.category } as Parameters<typeof getSegmentColor>[0];
          const color = getSegmentColor(seg);
          return (
            <div key={i} className="flex items-center gap-2 py-1">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[12px] text-primary truncate flex-1">{stop.name}</span>
              <span className="text-[10px] font-mono text-dim flex items-center gap-0.5">
                <Clock size={9} />{stop.duration_minutes}m
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
