// Domain models — ported 1:1 from the .NET SerienStreamAPI models.
// Enums are represented as their string values (the original serialized them
// as strings via JsonStringEnumConverter), so the frontend contract is identical.

export type Hoster = "Unknown" | "VOE" | "Doodstream" | "Vidoza" | "Streamtape";

export type Language = "Unknown" | "German" | "English" | "Japanese";

export interface MediaLanguage {
  audio: Language;
  subtitle: Language | null;
}

export interface Media {
  number: number;
  title: string;
  originalTitle: string;
  hosters: Hoster[];
  languages: MediaLanguage[];
}

export interface Series {
  title: string;
  description: string;
  bannerUrl: string;
  yearStart: number;
  yearEnd: number | null;
  directors: string[];
  actors: string[];
  creators: string[];
  countriesOfOrigin: string[];
  genres: string[];
  ageRating: number;
  ratingsCount: number;
  imdbUrl: string | null;
  trailerUrl: string | null;
  hasMovies: boolean;
  seasonsCount: number;
}

export interface VideoStream {
  videoUrl: string;
  hoster: Hoster;
  language: MediaLanguage;
}

export interface VideoDetails {
  number: number;
  season: number | null;
  title: string;
  originalTitle: string;
  description: string;
  streams: VideoStream[];
}

export interface SearchResultItem {
  title: string;
  description: string;
  link: string;
}

export interface AppConfig {
  hostUrl: string;
  site: string;
  ignoreCertificateValidation: boolean;
  passwordHashSHA256: string;
}
