import { create } from 'zustand';
import type { TripPlanData, GeocodedStop } from '@/lib/tripBuilder';
import { buildTripFromGeocodedStops } from '@/lib/tripBuilder';
import type { CurrentTripSnapshot } from '@/lib/chatTools';
import { isStopSegment } from '@/types/segment';
import useTripStore from './tripStore';
import usePlaybackStore from './playbackStore';
import useTripsListStore from './tripsListStore';

function buildCurrentTripSnapshot(): CurrentTripSnapshot | null {
  const { trip, segments } = useTripStore.getState();
  if (!trip || !segments || segments.length === 0) return null;

  const tz = trip.timezone;
  const stops = segments.filter(isStopSegment).map((s) => {
    const d = new Date(s.startTime);
    const isoLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d).reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
    const startLocal = `${isoLocal.year}-${isoLocal.month}-${isoLocal.day} ${isoLocal.hour}:${isoLocal.minute}`;
    return {
      name: s.title,
      category: s.category,
      duration_minutes: s.duration_minutes,
      start_time: startLocal,
      place_query: s.details.photo_query,
      description: s.details.description,
    };
  });

  return {
    title: trip.title,
    description: trip.description,
    start_date: trip.start_date,
    end_date: trip.end_date,
    timezone: tz,
    stops,
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tripPlan?: TripPlanData;
  functionCall?: string;
  functionCallArgs?: unknown;
}

interface ChatStore {
  tripId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  currentPlan: TripPlanData | null;
  /** ID of the message whose plan is currently being built (for per-card spinner). */
  buildingMessageId: string | null;
  /** ID of the message whose plan was successfully built last (for "Built ✓" badge). */
  builtMessageId: string | null;
  buildError: string | null;
  loadingHistory: boolean;

  loadForTrip: (tripId: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  buildTrip: (plan?: TripPlanData, messageId?: string) => Promise<boolean>;
  reset: () => void;
}

let msgCounter = 0;

async function persistMessage(
  tripId: string,
  msg: { role: 'user' | 'assistant'; content: string; function_call?: string; function_call_args?: unknown; trip_plan?: unknown }
) {
  try {
    await fetch(`/api/trips/${tripId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
  } catch {
    // Non-fatal — user can still continue chatting; message just won't resume on refresh.
  }
}

const useChatStore = create<ChatStore>((set, get) => ({
  tripId: null,
  messages: [],
  isStreaming: false,
  currentPlan: null,
  buildingMessageId: null,
  builtMessageId: null,
  buildError: null,
  loadingHistory: false,

  loadForTrip: async (tripId: string) => {
    set({ tripId, loadingHistory: true, messages: [], currentPlan: null });
    try {
      const res = await fetch(`/api/trips/${tripId}/messages`);
      if (!res.ok) {
        set({ loadingHistory: false });
        return;
      }
      const rows: Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        function_call: string | null;
        function_call_args: unknown;
        trip_plan: TripPlanData | null;
      }> = await res.json();

      let latestPlan: TripPlanData | null = null;
      const messages: ChatMessage[] = rows.map((r) => {
        if (r.trip_plan) latestPlan = r.trip_plan;
        return {
          id: r.id,
          role: r.role,
          content: r.content,
          tripPlan: r.trip_plan ?? undefined,
          functionCall: r.function_call ?? undefined,
          functionCallArgs: r.function_call_args ?? undefined,
        };
      });
      msgCounter = messages.length;
      set({ messages, currentPlan: latestPlan, loadingHistory: false });
    } catch {
      set({ loadingHistory: false });
    }
  },

  sendMessage: async (text: string) => {
    if (!text.trim() || get().isStreaming) return;
    const tripId = get().tripId;

    const userId = `msg-${++msgCounter}`;
    const userMsg: ChatMessage = { id: userId, role: 'user', content: text };
    set((s) => ({ messages: [...s.messages, userMsg] }));
    if (tripId) persistMessage(tripId, { role: 'user', content: text });

    const apiMessages = get().messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.functionCall && { functionCall: m.functionCall, functionCallArgs: m.functionCallArgs }),
    }));

    const assistantId = `msg-${++msgCounter}`;
    set((s) => ({
      isStreaming: true,
      messages: [...s.messages, { id: assistantId, role: 'assistant', content: '' }],
    }));

    try {
      const currentTrip = buildCurrentTripSnapshot();

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, currentTrip }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        const content = err?.error || 'Something went wrong. Please try again.';
        set((s) => ({
          isStreaming: false,
          messages: s.messages.map((m) => (m.id === assistantId ? { ...m, content } : m)),
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'text_delta') {
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + event.text } : m
                ),
              }));
            } else if (event.type === 'function_call' && event.name === 'propose_trip_plan') {
              const plan = event.args as TripPlanData;
              set((s) => ({
                currentPlan: plan,
                messages: s.messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, tripPlan: plan, functionCall: event.name, functionCallArgs: event.args }
                    : m
                ),
              }));
            } else if (event.type === 'error') {
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + (event.message || '') } : m
                ),
              }));
            }
          } catch {
            // skip malformed SSE
          }
        }
      }

      // Persist the completed assistant message
      if (tripId) {
        const final = get().messages.find((m) => m.id === assistantId);
        if (final) {
          persistMessage(tripId, {
            role: 'assistant',
            content: final.content,
            function_call: final.functionCall,
            function_call_args: final.functionCallArgs,
            trip_plan: final.tripPlan,
          });
        }
      }
    } catch {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId ? { ...m, content: 'Connection error. Please try again.' } : m
        ),
      }));
    } finally {
      set({ isStreaming: false });
    }
  },

  buildTrip: async (plan, messageId) => {
    const { tripId, currentPlan } = get();
    const planToBuild = plan ?? currentPlan;
    if (!planToBuild) return false;

    set({ buildingMessageId: messageId ?? '__current__', buildError: null });

    try {
      const geocoded: GeocodedStop[] = [];
      const batchSize = 3;

      for (let i = 0; i < planToBuild.stops.length; i += batchSize) {
        const batch = planToBuild.stops.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (stop) => {
            const res = await fetch(`/api/geocode?query=${encodeURIComponent(stop.place_query)}`);
            if (!res.ok) throw new Error(`Failed to geocode: ${stop.place_query}`);
            const geo = await res.json();
            return { ...stop, lat: geo.lat, lng: geo.lng } as GeocodedStop;
          })
        );
        geocoded.push(...results);
      }

      const { trip, segments, stats } = await buildTripFromGeocodedStops(planToBuild, geocoded);

      // Use the draft's existing tripId so we update in place (status flips to active)
      const finalTrip = tripId ? { ...trip, id: tripId, status: 'active' as const } : trip;

      // Save to Supabase FIRST so a navigation away from /new can't cancel the request.
      // Previously this was fire-and-forget and router.push('/') would abort the in-flight
      // POST, leaving the trip stuck as a draft with no segments in the DB.
      const saveRes = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip: finalTrip, segments }),
      });

      if (!saveRes.ok) {
        const body = await saveRes.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to save trip (${saveRes.status})`);
      }

      // Only after the server confirms the save do we update client state and redirect.
      const list = useTripsListStore.getState();
      if (tripId) list.removeTrip(tripId);
      list.addTrip(finalTrip, segments, stats);
      useTripStore.getState().loadTrip(finalTrip, segments, stats);
      usePlaybackStore.getState().reinitialize();
      useTripsListStore.setState({ activeTripId: finalTrip.id });

      set({
        buildingMessageId: null,
        builtMessageId: messageId ?? null,
      });
      return true;
    } catch (err) {
      set({
        buildingMessageId: null,
        buildError: err instanceof Error ? err.message : 'Failed to build trip',
      });
      return false;
    }
  },

  // Note: also reset build tracking on full reset to avoid stale highlights.
  reset: () => {
    msgCounter = 0;
    set({ tripId: null, messages: [], isStreaming: false, currentPlan: null, buildingMessageId: null, builtMessageId: null, buildError: null, loadingHistory: false });
  },
}));

export default useChatStore;
