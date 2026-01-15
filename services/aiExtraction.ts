import { GoogleGenAI } from "@google/genai";

const CACHE_KEY = "corks_ai_extraction_cache";
const MODEL_NAME = "gemini-2.5-flash"; // Using Flash for speed and efficiency

interface CacheEntry {
  hash: number;
  data: string[];
  timestamp: number;
}

// Simple string hash function
const cyrb53 = (str: string, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

const getCache = (): Record<string, CacheEntry> => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
};

const setCache = (key: string, data: string[], hash: number) => {
  const cache = getCache();
  cache[key] = { hash, data, timestamp: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
};

// Helper to strip HTML for cleaner token usage
const stripHtml = (html: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
};

const callGemini = async (prompt: string, description: string): Promise<string[]> => {
  try {
    if (!process.env.API_KEY) {
      throw new Error("API Key lipsă. Verifică setările.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Strict system instruction
    const systemInstruction = `Ești un asistent care extrage liste structurate din descrieri de evenimente.
Răspunsul tău trebuie să fie DOAR lista cerută.
Fiecare element pe o linie nouă.
Fără numerotare (1., -), fără bullets, fără text introductiv, fără markdown.
Dacă nu găsești informația, răspunde cu "NIMIC".`;

    const cleanDesc = stripHtml(description);
    
    // Timeout promise (12 seconds)
    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Request timed out")), 12000)
    );

    const apiCall = ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        { role: 'user', parts: [{ text: prompt }] },
        { role: 'user', parts: [{ text: `DESCRIERE EVENIMENT:\n${cleanDesc}` }] }
      ],
      config: {
        systemInstruction,
        temperature: 0.1, // Very low temperature for deterministic output
      }
    });

    const response = await Promise.race([apiCall, timeout]);
    
    // Use the correct property to access text
    const text = (response as any).text; 

    if (!text || text.includes("NIMIC")) return [];

    return text
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.match(/^(aici|lista|iata|sigur)/i)); // Extra cleanup filter

  } catch (error) {
    console.error("AI Extraction Error:", error);
    throw error;
  }
};

export const extractFoodMenu = async (eventId: string, description: string): Promise<string[]> => {
  const hash = cyrb53(description);
  const cacheKey = `food_${eventId}`;
  const cached = getCache()[cacheKey];

  if (cached && cached.hash === hash) {
    return cached.data;
  }

  const prompt = `Analizează descrierea și extrage DOAR preparatele de mâncare (meniul culinar).
Exclude băuturile. Exclude ingredientele generice dacă nu fac parte dintr-un fel de mâncare.
Fiecare preparat pe linie nouă.`;

  const data = await callGemini(prompt, description);
  setCache(cacheKey, data, hash);
  return data;
};

export const extractWineList = async (eventId: string, description: string): Promise<string[]> => {
  const hash = cyrb53(description);
  const cacheKey = `wine_${eventId}`;
  const cached = getCache()[cacheKey];

  if (cached && cached.hash === hash) {
    return cached.data;
  }

  const prompt = `Analizează descrierea și extrage DOAR lista vinurilor care se vor servi/degusta.
Exclude prețurile, exclude mâncarea.
Fiecare vin pe linie nouă.`;

  const data = await callGemini(prompt, description);
  setCache(cacheKey, data, hash);
  return data;
};
