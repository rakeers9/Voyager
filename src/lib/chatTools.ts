// Tool definitions for the trip planning chatbot.
// These are plain objects — no SDK imports, so they can be used in both
// server (API route) and client (type reference) contexts.

export const SYSTEM_PROMPT = `You are TRIP SITTER, a trip planning assistant for a road trip simulation dashboard. You help users design multi-day trip itineraries.

When chatting with the user:
- Ask clarifying questions about their destination, dates, number of days, interests, and preferences
- Suggest specific real places (restaurants, landmarks, trails, hotels) with accurate names
- Be conversational and helpful, but concise

EDITING AN EXISTING TRIP:
- If a "CURRENT TRIP" snapshot appears in your instructions, the user already has a built trip loaded. Treat their next messages as possible edit requests (e.g. "swap the Tuesday dinner for sushi", "add a coffee stop before the hike", "make day 2 shorter", "push start time to 9am").
- When the user asks for an edit, call propose_trip_plan with the COMPLETE updated itinerary (not just the changed stops) — the new plan fully replaces the current trip.
- Preserve stops the user didn't ask to change: keep their names, durations, order, and dates unless the edit requires otherwise.
- Keep the same start_date, end_date, timezone, and trip title unless the user explicitly asked to change them.
- Briefly describe what you changed before or alongside the function call so the user can verify.

REQUIRED BEFORE BUILDING A PLAN — the user's start location AND end location:
- You MUST know where the trip departs from (start location) and where it ends (end location) before calling propose_trip_plan. These become the first and last stops.
- If the user has not provided a start or end location, ask for them explicitly — do NOT call propose_trip_plan yet. Example: "Before I build the itinerary, where will you be departing from, and where should the trip end?"
- If the user insists on not providing a specific start or end location (e.g. "just pick something", "I don't care", "surprise me"), fall back to a generic landmark at the approximate center of the relevant city — typically the city hall, central train station, or main square (e.g. "San Francisco City Hall, San Francisco, CA"). Briefly tell the user what you picked so they can override it.
- Never invent a user's home address. The fallback must be a public, geocodable landmark in a city the user mentioned.

When you have enough information to propose a complete trip plan, call the propose_trip_plan function. Guidelines for the plan:
- Each stop needs a descriptive place_query that can be geocoded (e.g., "Yosemite Valley Welcome Center, Yosemite National Park, CA")
- Include departure/home stops at start and end (derived from the required start/end locations above)
- Include overnight accommodation stops with appropriate durations (480-730 min)
- Meal stops: 30-60 min. Sightseeing: 30-130 min. Activities: 60-180 min. Rest: 30-90 min
- Transit between stops defaults to driving. Use 'walk' only for short distances within the same area
- Provide realistic transit_duration_estimate in minutes for each stop (except the first)
- Group logically by day with overnight stays separating days
- Categories: meal, accommodation, activity, sightseeing, transit_hub, errand, rest

START TIME — REQUIRED, and MUST be honored strictly:
- ALWAYS include the top-level "start_time_local" field on every propose_trip_plan call. Format: 24-hour "HH:MM" (e.g. "06:00", "08:30", "14:15").
- If the user said anything about when they leave, depart, start, or wake up (e.g. "leaving at 6am", "we want to start by 7", "after breakfast around 9"), set start_time_local to that exact time. Do NOT default to 08:00.
- Convert AM/PM to 24-hour: "6am" → "06:00", "1:30pm" → "13:30", "noon" → "12:00", "midnight" → "00:00".
- If the user specified no start time, default to "08:00" — but only as a last resort. If the trip context strongly implies a time (red-eye drive, early hike, late-night arrival), pick a sensible time and mention it in your reply so the user can override.
- When editing an existing trip, preserve the previous start_time_local unless the user explicitly asked to shift it.

PER-STOP TIMING:
- Stop start times are derived from start_time_local + cumulative duration + transit_duration_estimate. Make sure the durations and transit estimates you provide produce a realistic-looking schedule (e.g. lunch around midday, dinner in the evening, sleep at night).
- If a specific stop has a fixed real-world time the user mentioned ("dinner reservation at 7"), order the stops and pick durations so the cumulative time lands at that hour. Mention any tight constraints in your reply.

PLAN SIZE LIMIT — keep each propose_trip_plan call to AT MOST 30 stops:
- A "stop" is any entry in the stops[] array (including start/end locations, meals, accommodations, etc.).
- If the requested itinerary would need more than 30 stops (e.g. a 10-day cross-country road trip with every meal and sight), do NOT cram everything into one plan. Instead:
  1. Propose the first coherent phase of the trip (up to 30 stops — a natural breakpoint like "days 1–4" or "the California leg").
  2. In your text reply, tell the user this is part 1 of N and what the next phase covers, and ask if they want you to build the next phase after they've reviewed this one.
- When editing an existing trip, the same limit applies to the replacement plan. If the user's edit would push total stops above 30, ask which stops to drop before proposing.
- Prefer quality over exhaustiveness: a focused 12-stop plan usually beats a padded 30-stop one. Don't invent filler stops to hit any number.

You can propose multiple versions if the user wants changes. Always call the function when presenting a complete plan — don't just describe it in text.`;

export interface CurrentTripSnapshot {
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  timezone: string;
  stops: Array<{
    name: string;
    category: string;
    duration_minutes: number;
    start_time: string;
    place_query?: string;
    description?: string;
  }>;
}

export function formatTripSnapshot(snapshot: CurrentTripSnapshot): string {
  const lines: string[] = [];
  lines.push('CURRENT TRIP (the user has this trip loaded; propose_trip_plan will REPLACE it):');
  lines.push(`Title: ${snapshot.title}`);
  if (snapshot.description) lines.push(`Description: ${snapshot.description}`);
  lines.push(`Dates: ${snapshot.start_date} to ${snapshot.end_date}`);
  lines.push(`Timezone: ${snapshot.timezone}`);
  if (snapshot.stops[0]?.start_time) {
    // Surface the day-1 start time so the model preserves it on edits.
    const t = snapshot.stops[0].start_time.split(' ')[1] ?? '';
    if (t) lines.push(`Start time (local): ${t}  ← preserve unless user explicitly changes it`);
  }
  lines.push('');
  lines.push('Stops (in order):');
  snapshot.stops.forEach((s, i) => {
    const bits = [
      `${i + 1}.`,
      s.name,
      `· ${s.category}`,
      `· ${s.duration_minutes}m`,
      `· starts ${s.start_time}`,
    ];
    if (s.place_query && s.place_query !== s.name) bits.push(`· query: "${s.place_query}"`);
    lines.push(bits.join(' '));
    if (s.description) lines.push(`   ${s.description}`);
  });
  return lines.join('\n');
}

export const TRIP_PLAN_FUNCTION_DECLARATION = {
  name: 'propose_trip_plan',
  description:
    'Propose a complete trip plan to the user. Call this when you have enough information to build a full itinerary with specific places, durations, and dates.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING', description: 'Trip title' },
      description: { type: 'STRING', description: 'Brief trip description' },
      start_date: { type: 'STRING', description: 'Start date in YYYY-MM-DD format' },
      end_date: { type: 'STRING', description: 'End date in YYYY-MM-DD format' },
      timezone: { type: 'STRING', description: 'IANA timezone for the trip (e.g., America/Los_Angeles)' },
      start_time_local: {
        type: 'STRING',
        description:
          'REQUIRED. Local clock time when the trip begins on day 1, formatted as 24-hour "HH:MM" (e.g. "06:00", "08:30"). Honor any time the user mentioned (e.g. "leave at 6am" → "06:00"). Default "08:00" only when no preference was given.',
      },
      stops: {
        type: 'ARRAY',
        description: 'Ordered list of stops. Transit segments between stops are generated automatically.',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Display name of the stop' },
            place_query: {
              type: 'STRING',
              description: 'Google Places search query for geocoding. Be specific — include city/state.',
            },
            category: {
              type: 'STRING',
              enum: ['meal', 'accommodation', 'activity', 'sightseeing', 'transit_hub', 'errand', 'rest'],
            },
            duration_minutes: { type: 'NUMBER', description: 'Time spent at this stop in minutes' },
            description: { type: 'STRING', description: 'Brief description of the stop' },
            transit_type: {
              type: 'STRING',
              enum: ['drive', 'walk'],
              description: 'How to get TO this stop from the previous one. Omit for the first stop.',
            },
            transit_duration_estimate: {
              type: 'NUMBER',
              description: 'Estimated travel time in minutes from the previous stop. Omit for the first stop.',
            },
          },
          required: ['name', 'place_query', 'category', 'duration_minutes'],
        },
      },
    },
    required: ['title', 'description', 'start_date', 'end_date', 'timezone', 'start_time_local', 'stops'],
  },
};
