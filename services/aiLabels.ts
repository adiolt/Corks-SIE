import { GoogleGenAI } from "@google/genai";
import { DrinksLabel, ThemeLabel } from "../types";

const MODEL_NAME = "gemini-2.5-flash";

interface AIResponse {
  drinks_label: DrinksLabel;
  theme_label: ThemeLabel;
  confidence: number;
  reasoning: string;
}

/**
 * Generates structured labels for an event.
 */
export async function generateEventLabels(input: {
  eventId: number;
  title: string;
  description: string;
  wineList?: string[];
}): Promise<AIResponse> {
  if (!process.env.API_KEY) {
    throw new Error("API Key lipsă. Verifică setările.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const wineListContext = input.wineList && input.wineList.length > 0
    ? `LISTA VINURI EXTRASA:\n${input.wineList.join('\n')}`
    : "LISTA VINURI: (Nu este disponibilă, deduce din descriere)";

  const prompt = `Analizează acest eveniment și clasifică-l strict.

${wineListContext}

TITLU: ${input.title}
DESCRIERE: ${input.description}

REGULI CLASIFICARE DRINKS (Alege una):
1. "Vin Roșu" (>75% vinuri roșii)
2. "Vin Alb" (>75% vinuri albe)
3. "Vin Rose" (>75% vinuri rose)
4. "Vin Spumant" (>75% spumante)
5. "Vin Mix" (mixt, niciunul >75%)
6. "Spirtoase" (>50% tărie: rom, whisky, etc)
7. "Others" (altceva)

REGULI CLASIFICARE THEME (Alege una care descrie focusul principal):
["Gastronomic Events", "Crame Romanesti", "Crame internationale", "Regiuni viti-vinicole", "Zile Nationale", "Soiuri", "Styles", "Expert", "Social/Party"]

Theme Hint:
- Gastronomic Events: focus mâncare
- Social/Party: muzică, quiz, party, dating
- Crame Romanesti/internationale: cramă specifică
- Expert: verticală, masterclass tehnic

OUTPUT: Strict JSON format.
{
  "drinks_label": "...",
  "theme_label": "...",
  "confidence": 0.95,
  "reasoning": "scurt text explicativ max 200 chars in romana"
}
`;

  try {
    const result = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      }
    });

    const text = result.text;
    if (!text) throw new Error("Empty AI response");

    // Clean potential markdown fences if model ignores MIME type
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(jsonStr) as AIResponse;

    return {
      drinks_label: data.drinks_label || "Others",
      theme_label: data.theme_label || "Social/Party",
      confidence: data.confidence || 0.5,
      reasoning: data.reasoning || "Generat automat",
    };

  } catch (err) {
    console.error(`AI Label Gen Error for ${input.eventId}:`, err);
    // Return safe fallback instead of crashing
    return {
      drinks_label: "Others",
      theme_label: "Social/Party",
      confidence: 0,
      reasoning: "Eroare generare AI"
    };
  }
}