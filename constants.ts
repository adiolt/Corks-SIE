
import { EventType, UserRole } from "./types";

export const APP_NAME = "Corks SIE (Sistem Inteligent de Evenimente)";
export const DEFAULT_CAPACITY = 36;

// Mapping for event types keywords to classify WP events automatically
export const EVENT_KEYWORDS: Record<string, EventType> = {
  'degustare': EventType.DEGUSTARE,
  'tasting': EventType.DEGUSTARE,
  'masterclass': EventType.MASTERCLASS,
  'pairing': EventType.PAIRING,
  'cina': EventType.PAIRING,
  'whisky': EventType.WHISKY,
  'whiskey': EventType.WHISKY,
  'rum': EventType.ROM,
  'rom': EventType.ROM,
  'cocktail': EventType.COCKTAIL,
  'special': EventType.SPECIAL
};

// Seed Data for "Mock" Mode
export const SEED_EVENTS = [
  {
    wp_event_id: 101,
    title: "Degustare Premium: Fetească Neagră",
    description: "O călătorie prin cele mai bune expresii ale soiului Fetească Neagră din Dealu Mare și Drăgășani.",
    start_datetime: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString(), // 2 days from now
    price: 150,
    event_type: EventType.DEGUSTARE,
    wine_focus: "Fetească Neagră, România",
    capacity: 36
  },
  {
    wp_event_id: 102,
    title: "Masterclass Champagne & Sparkling",
    description: "Invățăm diferența dintre metoda tradițională și Charmat cu 5 spumante internaționale.",
    start_datetime: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString(),
    price: 250,
    event_type: EventType.MASTERCLASS,
    wine_focus: "Champagne, Cava, Prosecco",
    capacity: 36
  },
  {
    wp_event_id: 103,
    title: "Whisky & Cigar Night",
    description: "Seară relaxată cu single malts afumate.",
    start_datetime: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString(), // Past event
    price: 180,
    event_type: EventType.WHISKY,
    capacity: 36
  }
];

export const MOCK_USERS = [
  { id: 'u1', name: 'Admin Corks', email: 'admin@corks.ro', role: UserRole.ADMIN },
  { id: 'u2', name: 'Manager Sala', email: 'manager@corks.ro', role: UserRole.MANAGER },
  { id: 'u3', name: 'Staff Bar', email: 'staff@corks.ro', role: UserRole.STAFF },
];