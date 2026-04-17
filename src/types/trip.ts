export type TripStatus = 'draft' | 'active' | 'archived';

export interface Trip {
  id: string;
  title: string;
  description: string;
  start_date: string; // ISO date string
  end_date: string;
  timezone: string;   // IANA timezone (e.g., 'America/Los_Angeles')
  status: TripStatus;
}

export interface TripStats {
  totalSegments: number;
  totalStops: number;
  totalDrives: number;
  totalWalks: number;
  totalDrivingDistance: number;  // meters
  totalWalkingDistance: number;  // meters
  totalDays: number;
  tripStartTime: number; // unix ms
  tripEndTime: number;   // unix ms
}
