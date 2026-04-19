# Trip Sitter — Trip Simulation Dashboard
## Full Product & Engineering Plan

> **What this document is:** A complete specification for building a production-grade trip visualization and planning platform. The product lets users build comprehensive travel plans, then experience them through an animated map simulation with a Palantir-style mission control dashboard. This document should be treated as the source of truth for all architectural decisions, data modeling, UI design, and build sequencing.

> **Target quality bar:** Production-grade. Auth, persistence, proper error handling, responsive design, real API integrations. Not a prototype, not a demo — a product someone could sign up for and use.

---

## 1. PRODUCT VISION

### What Trip Sitter Is

A **trip simulation engine** disguised as a planning tool. Users build a travel plan (road trip, city trip, multi-day adventure), and the platform turns it into a playable, animated experience on a map — press play, watch yourself drive down the highway, arrive at a restaurant, walk through a city, check into a hotel. The entire trip plays out in real time (with speed controls) on a dark, high-information-density dashboard inspired by Palantir's operational UIs.

### What Makes It Different

The hero feature is **playback**. Other trip planners give you a list. Trip Sitter gives you a simulation. You can scrub through your trip like a video, see exactly when you'll be where, pause at any point to inspect details, and edit on the fly. The map is the center of the experience, with contextual intelligence panels around it.

### Core User Flow (MVP)

1. User signs up / logs in
2. User creates a new trip (title, date range)
3. User adds stops in order — searches for places, sets times and durations
4. System auto-generates drive/walk segments between stops (via Directions API)
5. User views the full trip on the simulation dashboard
6. User presses play → map animates their position along the route, intel panels update with current segment context
7. User can pause, scrub, jump to any segment, and edit anything inline
8. Trip saves automatically to the database

### Long-Term Vision (Post-MVP)

- **AI-assisted trip building** — describe a trip in natural language, LLM parses it into segments
- **Trip templates** — popular routes (PCH road trip, Route 66, European backpacking) as starting points
- **Collaborative planning** — invite others to view or co-edit a trip in real time
- **Public trip sharing** — share a read-only playback link (like sharing a Spotify playlist, but for travel)
- **Mobile app** — React Native companion for on-the-go reference during actual travel
- **Live trip tracking** — during the actual trip, real GPS position overlaid on the planned route
- **Trip themes/skins** — military ops, nautical, explorer, minimal — different visual identities for the same data
- **Export** — Google Maps directions, PDF itinerary, calendar events
- **Weather integration** — live forecasts for each stop/day
- **Budget tracking** — cost estimates per segment, running trip total, split calculations for group trips
- **Photo diary** — attach photos to segments after the trip, creating a visual replay

---

## 2. THE THREE SEGMENT TYPES

Every trip is an ordered sequence of **segments**. There are exactly three types:

### STOP
You are stationary at a location. This is where things happen — eating, sleeping, sightseeing, resting, refueling.

- Has a single geographic point (lat/lng)
- Has a duration (e.g., "2 hours at Yosemite Valley")
- Has a category: `meal`, `accommodation`, `activity`, `sightseeing`, `transit_hub`, `errand`, `rest`
- Has flexible metadata (restaurant details, hotel confirmation, trail info, etc.)
- Visually: a pin/marker on the map, a colored block on the Gantt timeline

### DRIVE
You are moving in a vehicle — car, bus, rental, rideshare.

- Has an origin point and destination point
- Has a route polyline (from Directions API, `profile: driving`)
- Has a computed duration and distance
- Visually: a solid colored line on the map, a moving car icon during playback, a narrow block on the Gantt

### WALK
You are moving on foot — hiking, city walking, boardwalk, trail.

- Same structure as DRIVE but uses `profile: walking` for routing
- Different visual treatment: dotted line on the map, walking figure icon
- Often shorter segments with lower speeds

### The Fundamental Rule

The timeline always alternates: **STOP → transit → STOP → transit → STOP**

A transit segment (DRIVE or WALK) always connects two STOPs. Users only create STOPs — the system generates the transit segments between them automatically using the Directions API. Users choose whether each transit is a drive or walk (default: drive).

When the user adds, removes, or reorders stops, transit segments regenerate automatically.

---

## 3. DATA MODEL

### Database: Supabase (PostgreSQL)

#### `profiles` table
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `trips` table
```sql
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  cover_image_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  settings JSONB DEFAULT '{}',  -- trip-level preferences (theme, default speed, units)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `segments` table
```sql
CREATE TABLE segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  sequence_order INTEGER NOT NULL,  -- 0-indexed position in the timeline
  type TEXT NOT NULL CHECK (type IN ('drive', 'stop', 'walk')),

  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,

  -- Location (all types have at least one point)
  title TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  place_id TEXT,  -- Google Places ID for pulling photos/details

  -- Transit-specific (drive + walk only)
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  polyline TEXT,  -- encoded route polyline
  distance_meters INTEGER,

  -- Stop-specific
  category TEXT CHECK (category IN (
    'meal', 'accommodation', 'activity', 'sightseeing',
    'transit_hub', 'errand', 'rest'
  )),

  -- Flexible metadata
  details JSONB DEFAULT '{}',
  /*
    details can include any of:
    {
      description: string,
      photos: string[],         // URLs
      rating: number,           // 1-5
      price_level: number,      // 1-4 ($-$$$$)
      address: string,
      phone: string,
      website: string,
      hours: string,
      confirmation_number: string,  // accommodation
      cuisine: string,              // meal
      trail_difficulty: string,     // activity/walk
      notes: string,                // user's personal notes
      cost_cents: number,           // estimated cost
      tags: string[],
    }
  */

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast trip loading
CREATE INDEX idx_segments_trip_order ON segments(trip_id, sequence_order);
```

#### `trip_members` table (for future collaboration)
```sql
CREATE TABLE trip_members (
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  role TEXT DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
```

#### Row-Level Security (RLS)
```sql
-- Users can read trips they own or are members of
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own trips" ON trips
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert own trips" ON trips
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own trips" ON trips
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Users can delete own trips" ON trips
  FOR DELETE USING (owner_id = auth.uid());

-- Segments inherit trip access
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage segments of own trips" ON segments
  FOR ALL USING (
    trip_id IN (SELECT id FROM trips WHERE owner_id = auth.uid())
  );
```

### The Cascade Reflow Function

When any segment's duration changes, all subsequent segments must shift in time. This is a critical client-side function:

```
function reflowTimeline(segments: Segment[], fromIndex: number): Segment[] {
  const result = [...segments];
  for (let i = fromIndex + 1; i < result.length; i++) {
    result[i].start_time = result[i - 1].end_time;
    result[i].end_time = addMinutes(result[i].start_time, result[i].duration_minutes);
  }
  return result;
}
```

Users set **durations** (except the trip start time). All absolute times are computed by cascading forward from the first segment.

---

## 4. TECH STACK

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | **Next.js 14+ (App Router)** | SSR for landing/marketing pages, CSR for the dashboard. File-based routing, API routes for backend logic |
| Language | **TypeScript** | Non-negotiable for a production app of this complexity |
| Database + Auth | **Supabase** | Postgres, auth (email + Google OAuth), realtime subscriptions (future collab), file storage (future photo uploads), RLS for access control |
| Maps | **Mapbox GL JS** | Superior animation/interpolation APIs, better custom dark styling, smoother route rendering than Google Maps. Use `mapbox-gl` npm package |
| Routing/Directions | **Mapbox Directions API** | For resolving route polylines between stops. Returns encoded polylines + duration + distance. Walking and driving profiles |
| Place Search | **Google Places API (New)** | For searching and selecting stops. Autocomplete, place details, photos. Google's place database is significantly better than alternatives |
| State Management | **Zustand** | Lightweight, minimal boilerplate, works well for the playback engine (cursor, play/pause, speed) which has many subscribers across components |
| Styling | **Tailwind CSS** | Utility-first, custom design tokens for the dark theme |
| Animation | **Framer Motion** | Panel transitions, segment highlights, smooth UI state changes |
| Deployment | **Vercel** | Natural pairing with Next.js, edge functions, preview deployments |

### Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=
```

---

## 5. UI / DASHBOARD DESIGN

### Design System — Dark Industrial / Palantir Aesthetic

This is a high-information-density, dark-themed operational dashboard. Think Palantir Gotham, Bloomberg Terminal, or a military COP (Common Operating Picture).

#### Color Tokens
```css
--bg-primary: #0A0C10;       /* Near-black, the base */
--bg-surface: #161B22;       /* Cards, panels */
--bg-surface-hover: #1C2128; /* Hover states */
--bg-elevated: #21262D;      /* Modals, dropdowns */
--border-primary: #30363D;   /* Default borders */
--border-active: #58A6FF;    /* Focus / active borders */
--text-primary: #C9D1D9;     /* Primary text */
--text-secondary: #8B949E;   /* Muted / secondary text */
--text-heading: #FFFFFF;      /* High-emphasis headings */

/* Semantic / status colors */
--status-red: #F85149;        /* Danger, alerts */
--status-amber: #D29922;      /* Warnings, caution */
--status-green: #3FB950;      /* Success, active, on-time */
--status-blue: #58A6FF;       /* Info, links, interactive */
--status-violet: #A371F7;     /* Special, premium */

/* Segment type colors */
--segment-drive: #58A6FF;     /* Blue for driving */
--segment-walk: #3FB950;      /* Green for walking */
--segment-stop-meal: #D29922;       /* Amber */
--segment-stop-accommodation: #A371F7; /* Violet */
--segment-stop-activity: #F0883E;    /* Orange */
--segment-stop-sightseeing: #58A6FF; /* Blue */
--segment-stop-errand: #8B949E;      /* Gray */
--segment-stop-rest: #6E7681;        /* Dim gray */
```

#### Typography
```css
--font-ui: 'Inter', sans-serif;        /* All UI text */
--font-mono: 'JetBrains Mono', 'Geist Mono', monospace; /* Data, numbers, timestamps */
```

#### Key Visual Principles
- **No white backgrounds anywhere.** Every surface is a shade of near-black or dark gray.
- **Borders define regions, not shadows.** Use 1px borders with `--border-primary`, not box-shadows.
- **Monospace for data.** Timestamps, distances, durations, coordinates — all in the mono font.
- **Color is semantic.** Color means something (segment type, status). Don't use color decoratively.
- **Information density over whitespace.** Pack information in. This is a dashboard, not a marketing page.
- **Subtle glow effects.** Active elements get a soft glow (box-shadow with segment color at low opacity) rather than a background color change.
- **Grid lines and rules.** Use thin horizontal rules between list items, grid overlays on the timeline.

### Dashboard Layout

```
┌────────────────────────────────────────────────────────────────┐
│  TOP BAR                                                       │
│  [< Back] Trip Title          ■ Day 1 ■ Day 2 ■ Day 3  [⚙]  │
│  Apr 9-12, 2026 · 847 mi · 14 stops · 3 days                  │
├──────────────────────────────────────────┬─────────────────────┤
│                                          │                     │
│              MAP VIEWPORT                │    INTEL PANEL      │
│          (60-70% of width)               │    (30-40%)         │
│                                          │                     │
│  - Full Mapbox GL canvas                 │  Current segment:   │
│  - Dark custom style                     │  ┌───────────────┐  │
│  - Route polylines (color by type)       │  │ Curry Village  │  │
│  - Animated position marker              │  │ Lunch · 1.5hr  │  │
│  - Stop markers with category icons      │  │ ★ 4.2 · $$ ·  │  │
│  - Past route dimmed, future bright      │  │ American       │  │
│  - Camera follows playback position      │  │ [notes field]  │  │
│  - Walk routes: dotted lines             │  │ [edit] [delete]│  │
│  - Drive routes: solid lines             │  └───────────────┘  │
│                                          │                     │
│                                          │  Up next:           │
│                                          │  → 45 min drive     │
│                                          │  □ Glacier Point    │
│                                          │  □ Valley View      │
│                                          │                     │
│                                          │  Day summary:       │
│                                          │  ├─ 3 stops         │
│                                          │  ├─ 127 mi driving  │
│                                          │  └─ 2.3 mi walking  │
│                                          │                     │
├──────────────────────────────────────────┴─────────────────────┤
│  TIMELINE BAR (Gantt-style, full width)                        │
│  ┌─ Day 1 (Thu) ─────┬─ Day 2 (Fri) ─────┬─ Day 3 (Sat) ──┐ │
│  │■■▶▶▶■■▶▶■■■■∙∙∙■■│■■▶▶▶▶▶■■■▶▶∙∙■■■■│■■■▶▶▶▶▶■■■■■■■│ │
│  └────────────────────┴────────────────────┴─────────────────┘ │
│  ▲ playhead (draggable)                                        │
│                                                                │
│  [|◀]  [▶ PLAY]  [▶|]    1x  2x  10x  50x     12:34 PM Thu  │
│                                                                │
│  ■ stop (colored by category)  ▶ drive (blue)  ∙∙ walk (green)│
└────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### Top Bar
- Back button (to trip list)
- Trip title (editable inline)
- Day tabs/pills for quick navigation
- Trip stats summary (total distance, total stops, duration)
- Settings gear icon

#### Map Viewport
- Mapbox GL JS canvas with custom dark style
- Route polylines rendered for all segments, colored by type
- Drive segments: solid lines with `--segment-drive` color
- Walk segments: dashed lines with `--segment-walk` color
- Stop markers: circular pins with category icons inside, colored by category
- Active segment: highlighted with glow, other segments dimmed
- Position marker: animated icon (car for drives, walking figure for walks, pulsing dot for stops)
- Camera: smoothly follows the playback position, auto-zooms based on current segment scale
- Past routes: lower opacity (0.3), future routes: full opacity (1.0)
- Click any marker or route to jump to that segment and inspect it

#### Intel Panel (Right Side)
- Context-sensitive — changes based on what the playback cursor is on
- **During a STOP:** full place details (name, category badge, rating, price level, hours, address, photos carousel, user notes, cost estimate). All fields are inline-editable.
- **During a DRIVE/WALK:** origin → destination, distance, ETA, route overview. Option to switch drive↔walk.
- **Below current segment:** "Up Next" queue showing the next 3-5 segments as a compact list
- **Day summary:** aggregate stats for the current day (distance, stop count, walk distance)
- **Add stop button:** always visible, inserts a new stop after the current segment
- **Edit controls:** delete segment, change duration, reorder (move up/down)

#### Timeline Bar (Gantt)
- Full-width horizontal bar at the bottom
- Each segment rendered as a proportional-width block
- Stops: colored by category, minimum width so they're always clickable
- Drives: `--segment-drive` color, narrower blocks
- Walks: `--segment-walk` color, dotted pattern
- Day dividers: vertical rules with day labels
- Playhead: vertical line with timestamp label, draggable for scrubbing
- Click any block to jump playback cursor to that segment
- Hover tooltip: segment title, time range, duration
- Playback controls below: play/pause, step forward/back, speed buttons (1x, 2x, 10x, 50x), current timestamp in mono font

---

## 6. PLAYBACK ENGINE

The playback engine is the core technical system. It manages the simulation cursor and computes the current state of the trip at any point in time.

### State (Zustand Store)

```typescript
interface PlaybackState {
  // Core playback state
  isPlaying: boolean;
  playbackSpeed: number;        // 1, 2, 10, 50
  cursorTime: number;           // Unix timestamp (ms) — current position
  tripStartTime: number;        // Unix timestamp of first segment start
  tripEndTime: number;          // Unix timestamp of last segment end

  // Derived (computed from cursorTime + segments)
  currentSegmentIndex: number;
  currentSegment: Segment | null;
  progressInSegment: number;    // 0.0 to 1.0 — how far through current segment
  currentPosition: { lat: number; lng: number }; // interpolated for transit, exact for stops

  // Actions
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  seekTo: (timestamp: number) => void;
  jumpToSegment: (index: number) => void;
  stepForward: () => void;      // Jump to next segment start
  stepBackward: () => void;     // Jump to previous segment start
}
```

### Playback Loop

When `isPlaying` is true, a `requestAnimationFrame` loop runs:

```
Each frame:
  1. Compute elapsed real time since last frame (deltaMs)
  2. Advance cursorTime by deltaMs * playbackSpeed
  3. If cursorTime > tripEndTime → pause, clamp to end
  4. Find which segment the cursor falls within (binary search on start_time/end_time)
  5. Compute progressInSegment = (cursorTime - segment.start_time) / segment.duration
  6. If segment.type === 'stop':
       currentPosition = { segment.latitude, segment.longitude }
  7. If segment.type === 'drive' or 'walk':
       Decode segment.polyline into coordinate array
       Interpolate position along polyline at progressInSegment
       currentPosition = interpolated point
  8. Update store → triggers map camera + marker update + intel panel update
```

### Polyline Interpolation

For transit segments, the position is interpolated along the route polyline:

```
function interpolateAlongPolyline(
  coordinates: [number, number][],  // decoded polyline
  progress: number                   // 0.0 to 1.0
): { lat: number; lng: number }
```

This computes the total distance of the polyline, finds the point at `progress * totalDistance` along it, and interpolates between the two nearest coordinate pairs. Mapbox has utility functions for this (`turf.js` — `@turf/along`, `@turf/length`).

### Camera Behavior

The map camera should:
- **During drives/walks:** follow the position marker with smooth easing, zoom level based on segment distance (zoomed out for long highway drives, zoomed in for city walks)
- **During stops:** center on the stop location, zoom in to street level
- **On segment change:** animate camera transition (flyTo) over ~1 second
- **Manual pan/zoom by user:** temporarily disable camera following, re-enable on play or segment jump

---

## 7. TRIP BUILDING FLOW

### Creating a New Trip

1. User clicks "New Trip" from dashboard
2. Minimal form: title, start date, end date (can be changed later)
3. Creates a trip row in Supabase with status: 'draft'
4. Redirects to the simulation dashboard with an empty timeline
5. User sees the empty map and a prompt: "Add your first stop"

### Adding Stops

1. User clicks "Add Stop" (in intel panel or timeline bar)
2. **Place Search** — Google Places Autocomplete opens. User types a place name or address.
3. User selects a place from results → system pulls place details (name, lat/lng, place_id, rating, photos, hours, address)
4. User sets: category (meal/activity/accommodation/etc.), duration, optional notes
5. System inserts the STOP segment into the timeline at the correct position
6. If this isn't the first stop → system auto-generates a DRIVE segment between the previous stop and this one:
   - Calls Mapbox Directions API with `profile: driving-traffic`
   - Gets polyline, duration, distance
   - Inserts DRIVE segment before the new STOP
7. Timeline reflows — all subsequent segment times cascade

### Editing Segments

- **Change duration:** inline number input in intel panel. On change, reflow all subsequent segments.
- **Change category:** dropdown in intel panel.
- **Edit details:** all fields in the intel panel are inline-editable (notes, cost, description, etc.)
- **Switch drive↔walk:** toggle button on transit segments. Re-calls Directions API with new profile, updates polyline/duration.
- **Delete segment:** removes the stop AND its associated transit segments. Remaining stops get new transit segments generated between them.
- **Reorder:** drag-and-drop on the Gantt bar, or move up/down buttons. Transit segments regenerate.

### Adding a Stop Mid-Trip (Insert)

User can "insert after" any existing segment:
1. New stop is inserted at that position
2. The old transit segment connecting the surrounding stops is deleted
3. Two new transit segments are generated: previous stop → new stop, and new stop → next stop
4. Timeline reflows

---

## 8. PRODUCTION REQUIREMENTS

### Authentication
- Supabase Auth with email/password and Google OAuth
- Profile creation on first sign-in (display name prompt)
- Protected routes — simulation dashboard requires auth, landing page does not
- Session management via Supabase client library

### Data Persistence
- All trip and segment data stored in Supabase Postgres
- Auto-save: debounced (1-2 second delay) save to Supabase on every edit
- Optimistic UI — changes reflect immediately, sync in background
- Conflict handling (MVP): last-write-wins. Show a toast if a save fails and retry.
- Loading states: skeleton UI while trip data fetches

### Error Handling
- API failures (Directions API, Places API): show inline error, allow retry, don't break the UI
- Network offline: queue changes, sync when back online (or at minimum, warn the user)
- Invalid segment data: validation on both client and database level (CHECK constraints)
- Rate limiting awareness: Mapbox and Google APIs have rate limits — batch requests, cache results

### Performance
- Polyline decoding: do once on load, cache decoded coordinates in memory
- Segment lookup by time: maintain a sorted index for O(log n) binary search during playback
- Map rendering: use Mapbox layers efficiently — one source for all routes, filter by segment type
- Virtualized segment list: if a trip has 50+ segments, the Gantt bar and intel panel lists should virtualize
- Debounce saves: don't hit Supabase on every keystroke, debounce to 1-2 seconds

### Responsive Design
- Primary target: desktop (1280px+) — this is a dashboard, it needs screen real estate
- Tablet (768-1279px): stack intel panel below map instead of beside it, collapse Gantt to mini view
- Mobile (< 768px): map full screen with bottom sheet for intel panel, swipeable timeline
- The Gantt timeline should be horizontally scrollable on all screen sizes

### API Key Security
- Google Places API key: restrict to your domain in Google Cloud Console
- Mapbox token: use URL restrictions in Mapbox dashboard
- Supabase anon key: safe for client-side (RLS protects data)
- Supabase service role key: server-side only (Next.js API routes / server components)

---

## 9. FILE / FOLDER STRUCTURE

```
tripsitter/
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout, fonts, providers
│   │   ├── page.tsx                   # Landing page (public, SSR)
│   │   ├── login/
│   │   │   └── page.tsx               # Auth page
│   │   ├── dashboard/
│   │   │   └── page.tsx               # Trip list (protected)
│   │   ├── trip/
│   │   │   └── [tripId]/
│   │   │       └── page.tsx           # Simulation dashboard (protected)
│   │   └── api/
│   │       ├── directions/
│   │       │   └── route.ts           # Proxy to Mapbox Directions API
│   │       └── places/
│   │           └── route.ts           # Proxy to Google Places API
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── TopBar.tsx
│   │   │   ├── DashboardShell.tsx     # The 3-zone layout wrapper
│   │   │   └── AuthGuard.tsx          # Redirect if not logged in
│   │   ├── map/
│   │   │   ├── MapViewport.tsx        # Mapbox GL canvas + all map logic
│   │   │   ├── RouteLayer.tsx         # Polyline rendering
│   │   │   ├── StopMarkers.tsx        # Stop pins with category icons
│   │   │   ├── PositionMarker.tsx     # Animated current-position icon
│   │   │   └── mapStyles.ts           # Custom Mapbox dark style config
│   │   ├── intel/
│   │   │   ├── IntelPanel.tsx         # Right panel container
│   │   │   ├── StopDetail.tsx         # Stop segment detail/edit view
│   │   │   ├── TransitDetail.tsx      # Drive/walk segment detail view
│   │   │   ├── UpNextQueue.tsx        # Upcoming segments list
│   │   │   ├── DaySummary.tsx         # Aggregate day stats
│   │   │   └── AddStopFlow.tsx        # Place search + stop creation
│   │   ├── timeline/
│   │   │   ├── GanttBar.tsx           # The horizontal segment bar
│   │   │   ├── SegmentBlock.tsx       # Individual segment in the Gantt
│   │   │   ├── Playhead.tsx           # Draggable cursor
│   │   │   └── PlaybackControls.tsx   # Play/pause, speed, step, timestamp
│   │   ├── trip/
│   │   │   ├── TripCard.tsx           # Trip summary card for dashboard
│   │   │   ├── CreateTripModal.tsx    # New trip form
│   │   │   └── TripSettings.tsx       # Trip-level settings
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Modal.tsx
│   │       ├── Badge.tsx
│   │       ├── Tooltip.tsx
│   │       └── Skeleton.tsx
│   │
│   ├── stores/
│   │   ├── playbackStore.ts           # Zustand — playback engine state
│   │   └── tripStore.ts              # Zustand — loaded trip + segments, edit actions
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              # Browser Supabase client
│   │   │   ├── server.ts              # Server-side Supabase client
│   │   │   └── types.ts              # Generated DB types (supabase gen types)
│   │   ├── mapbox/
│   │   │   ├── directions.ts          # Fetch route polyline between two points
│   │   │   └── polyline.ts            # Decode/encode/interpolate polylines
│   │   ├── google/
│   │   │   └── places.ts             # Places autocomplete + details
│   │   ├── segments/
│   │   │   ├── reflow.ts             # Cascade reflow function
│   │   │   ├── insert.ts             # Insert stop + auto-generate transit
│   │   │   ├── remove.ts             # Remove stop + regenerate transit
│   │   │   └── reorder.ts            # Reorder + regenerate transit
│   │   ├── playback/
│   │   │   ├── interpolation.ts      # Position interpolation along polylines
│   │   │   ├── camera.ts             # Camera behavior logic
│   │   │   └── segmentLookup.ts      # Binary search for current segment
│   │   └── utils/
│   │       ├── time.ts               # Date/time formatting, addMinutes, etc.
│   │       ├── distance.ts           # Distance formatting (mi/km)
│   │       └── debounce.ts
│   │
│   ├── hooks/
│   │   ├── useTrip.ts                # Fetch + subscribe to trip data
│   │   ├── useSegments.ts            # Fetch + CRUD segments
│   │   ├── useAutoSave.ts            # Debounced save to Supabase
│   │   ├── usePlayback.ts            # Playback RAF loop + controls
│   │   └── useAuth.ts               # Auth state + user info
│   │
│   └── types/
│       ├── segment.ts                 # Segment type definitions
│       ├── trip.ts                    # Trip type definitions
│       └── playback.ts               # Playback state types
│
├── public/
│   └── icons/                         # Category icons, vehicle icons, markers
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql     # All table definitions + RLS policies
│
├── tailwind.config.ts                 # Custom design tokens
├── next.config.ts
├── tsconfig.json
├── package.json
└── .env.local                         # API keys (never committed)
```

---

## 10. BUILD PHASES (ORDERED)

### Phase 1: Foundation + Static Playback
**Goal:** A single hardcoded trip playing back beautifully on the map with a working Gantt timeline.

1. Scaffold Next.js + TypeScript + Tailwind + Supabase project
2. Implement design system tokens (colors, fonts, spacing) in Tailwind config
3. Build the DashboardShell layout (3-zone: map, intel, timeline)
4. Create seed data — one compelling trip (SF → Yosemite, 3 days, ~15 segments with drives, walks, and stops) as a static JSON file
5. Build the Gantt timeline bar — render segments as proportional blocks, day dividers
6. Build the playback engine (Zustand store, RAF loop, cursor math)
7. Wire playback controls (play/pause, speed, step, scrub)
8. Integrate Mapbox — dark style, render route polylines, stop markers
9. Implement position interpolation — moving marker along polylines during playback
10. Implement camera following — smooth pan/zoom tracking the marker
11. Build the Intel panel — context-sensitive display for current segment
12. Wire click-to-jump (click Gantt block → jump cursor, click map marker → jump cursor)

**Deliverable:** A stunning demo with hardcoded data. Press play, watch the trip animate. This proves the product.

### Phase 2: Trip Building + Editing
**Goal:** Users can create and modify trips entirely through the UI.

1. Build the place search component (Google Places Autocomplete)
2. Build the "Add Stop" flow in the Intel panel
3. Implement auto-transit-generation — when a stop is added, call Mapbox Directions API to create the connecting drive segment
4. Implement cascade reflow
5. Build inline editing for all segment fields in the Intel panel
6. Implement segment deletion with transit regeneration
7. Implement segment reorder (drag on Gantt or move up/down)
8. Implement drive↔walk toggle with route re-resolution
9. Build the "Insert Stop After" flow for mid-trip additions
10. Build the Create Trip modal (title, dates)

**Deliverable:** Fully functional trip builder. No auth yet, data lives in memory/localStorage.

### Phase 3: Auth + Persistence
**Goal:** Real users, real data, real accounts.

1. Set up Supabase project with the schema from Section 3
2. Implement RLS policies
3. Build auth flow (login, signup, Google OAuth, logout)
4. Build the trip dashboard page (list trips, create, delete, open)
5. Build the profile setup flow (display name on first login)
6. Replace in-memory state with Supabase reads/writes
7. Implement auto-save (debounced writes on every edit)
8. Add loading states, error handling, optimistic updates
9. Protected route middleware (redirect to login if not authenticated)

**Deliverable:** A real product. Users sign up, create trips, edit them, come back later, everything persists.

### Phase 4: Polish + Quality of Life
**Goal:** Make it feel finished.

1. Landing page — marketing page explaining the product, with a CTA to sign up
2. Trip settings — rename, change dates, delete trip
3. Trip status management (draft → active → archived)
4. Keyboard shortcuts (spacebar = play/pause, arrow keys = step, number keys = speed)
5. Responsive design — tablet and mobile layouts
6. Empty states — helpful prompts when a trip has no segments yet
7. Undo/redo for segment edits (history stack in Zustand)
8. Better Gantt interactions — hover tooltips, smooth drag reorder
9. Night mode for stops — show opening hours warnings if a stop is scheduled outside business hours
10. Distance and duration formatting (mi/km toggle, human-readable times)

**Deliverable:** A polished, production-quality V1.

### Phase 5 (Future): Advanced Features
*Not in initial scope. Build after V1 ships and users validate the concept.*

- AI trip builder (natural language → segment list via LLM)
- Collaborative editing (Supabase Realtime, presence indicators)
- Public sharing (read-only playback links, no auth required)
- Trip templates (prebuilt popular routes)
- Weather overlay (forecast for each stop/day)
- Budget tracking (cost per segment, trip total, split calculator)
- Photo diary (attach images to segments after the trip)
- Export (Google Maps links, PDF itinerary, .ics calendar)
- Mobile companion app (React Native)
- Live GPS tracking during actual travel

---

## 11. SEED DATA (for Phase 1)

Use this hardcoded trip for initial development. It should showcase all three segment types, multiple categories, and span 3 days:

**Trip: "Yosemite Road Trip"**
**Date Range:** Thu Jun 11 – Sat Jun 13, 2026
**Start Location:** San Francisco, CA

Segment sequence:
1. STOP — Home (SF) — depart point — 30 min (loading car)
2. DRIVE — SF → In-N-Out Burger (Tracy, CA) — ~1.5hr
3. STOP — In-N-Out Burger, Tracy — meal — 45 min
4. DRIVE — Tracy → Yosemite Valley — ~2.5hr
5. STOP — Yosemite Valley Visitor Center — sightseeing — 1hr
6. WALK — Visitor Center → Lower Yosemite Fall — 30 min
7. STOP — Lower Yosemite Fall — activity — 1.5hr
8. WALK — Lower Yosemite Fall → Curry Village — 20 min
9. STOP — Curry Village Pizza Patio — meal — 1hr
10. DRIVE — Curry Village → Cabin (Foresta area) — 30 min
11. STOP — Cabin — accommodation — 12hr (overnight)
12. STOP — Cabin — rest/breakfast — 1hr
13. DRIVE — Cabin → Glacier Point — 45 min
14. STOP — Glacier Point — sightseeing — 1.5hr
15. WALK — Glacier Point overlook trail — activity — 45 min
16. DRIVE — Glacier Point → Tunnel View — 25 min
17. STOP — Tunnel View — sightseight — 30 min
18. DRIVE — Tunnel View → Mariposa Grove — 45 min
19. STOP — Mariposa Grove — activity — 2hr
20. DRIVE — Mariposa Grove → Cabin — 1hr
21. STOP — Cabin — accommodation — 12hr (overnight)
22. STOP — Cabin morning — rest — 1.5hr
23. DRIVE — Cabin → Oakdale In-N-Out — 2hr
24. STOP — In-N-Out Burger, Oakdale — meal — 45 min
25. DRIVE — Oakdale → San Francisco — 1.5hr
26. STOP — Home (SF) — arrival — 0 min

Fill in plausible lat/lng coordinates, realistic details, and actual place information for each stop. The polylines for drives/walks can initially be straight lines between points — real Directions API polylines get integrated in Phase 2.

---

## 12. KEY TECHNICAL DECISIONS LOG

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State management | Zustand | Playback engine needs many subscribers (map, timeline, intel panel) with minimal re-renders. useState alone would cause cascade re-renders |
| Database | Supabase Postgres | Auth + DB + realtime in one. Sreekar has prior experience with it. RLS for access control without custom backend |
| Data model | Normalized segments table (not JSONB blob) | Individual segment CRUD, reordering, future querying across trips. Trade-off: more DB calls on load, but cleaner mutations |
| Map | Mapbox GL JS | Superior animation APIs, better dark styling, smoother polyline rendering. More work than Google Maps but better result |
| Routing | Mapbox Directions API | Consistent ecosystem with the map. Walking + driving profiles. Free tier sufficient for MVP |
| Place search | Google Places API | Google's place database is unmatched. The two APIs (Mapbox for maps, Google for places) coexist fine |
| Transit segments | Auto-generated | Users think in stops, not drives. System handles the "how to get there" part automatically |
| Timing model | Duration-based with cascade reflow | Users set durations, system computes absolute times. Simpler mental model, no clock conflicts |
| Styling | Tailwind + CSS variables | Design tokens in CSS vars, utility classes for layout. Fast iteration on the dark theme |
| Font | Inter + JetBrains Mono | Industry standard pairing for data-heavy UIs |

---

*End of specification. Build it phase by phase. Phase 1 is the proof of concept — if the playback feels magical, everything else follows.*
