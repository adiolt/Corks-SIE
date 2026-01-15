export type ExtractedLists = {
  wines: string[];
  foods: string[];
};

/**
 * Normalizes HTML description to a clean array of text lines.
 * Handles <br>, <p>, <li> and basic cleanup.
 */
function normalizeToLines(html: string): string[] {
  if (!html) return [];

  // Pre-process structural tags to newlines before stripping tags
  // This ensures "Item 1</li><li>Item 2" becomes "Item 1\nItem 2"
  let processed = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n');

  // Use DOMParser to safely decode entities and strip remaining tags
  const parser = new DOMParser();
  const doc = parser.parseFromString(processed, 'text/html');
  const text = doc.body.textContent || "";

  return text
    .split('\n')
    .map(line => line.trim())
    // Replace multiple spaces
    .map(line => line.replace(/\s+/g, ' '))
    .filter(line => line.length > 0);
}

/**
 * Checks if a line is likely a header for the Wines section.
 */
function isWineHeader(line: string): boolean {
  const lower = line.toLowerCase();
  // Short line constraint to avoid matching narrative sentences containing the word "vin"
  if (line.length > 60) return false;
  
  const keywords = ['vinuri', 'lista vinuri', 'vinurile', 'degustam', 'degustăm', 'line-up', 'wines', 'wine list'];
  return keywords.some(k => lower.includes(k));
}

/**
 * Checks if a line is likely a header for the Food/Menu section.
 */
function isFoodHeader(line: string): boolean {
  const lower = line.toLowerCase();
  if (line.length > 60) return false;

  const keywords = ['meniu', 'mancare', 'mâncare', 'pairing', 'food', 'gustare', 'preparate'];
  return keywords.some(k => lower.includes(k));
}

/**
 * Determines if we've hit a section that signals the end of a list 
 * (e.g. Price info, Location info, "Limited spots")
 */
function isStopCondition(line: string): boolean {
  const lower = line.toLowerCase();
  
  // Footer markers
  if (lower.includes('locuri limita') || lower.includes('pret') || lower.includes('preț') || lower.includes('cost')) return true;
  if (lower.startsWith('rezerv') || lower.startsWith('data:')) return true;
  if (line.includes('🎟️') || line.includes('📅')) return true;

  // Narrative paragraph detection (heuristic)
  // If we find a very long line that doesn't look like a menu item (e.g. contains dot at end), it might be the closing paragraph
  if (line.length > 120 && (line.endsWith('.') || line.endsWith('!'))) return true;

  return false;
}

/**
 * Cleans a specific item line (removes bullets, numbers).
 */
function cleanItem(line: string): string {
  // Remove starting bullets or numbers like "1. ", "- ", "• "
  return line.replace(/^(\d+\.|-|•|\*|\+)\s*/, '').trim();
}

/**
 * Validates if a line is a likely list item.
 */
function isValidItem(line: string): boolean {
  if (line.length < 3) return false;
  
  // Exclude lines that look like marketing fluff
  const fluffStart = ['seara', 'te asteptam', 'te așteptăm', 'ideea', 'vom', 'pentru', 'haide'];
  const lower = line.toLowerCase();
  if (fluffStart.some(f => lower.startsWith(f))) return false;

  // Exclude lines that are likely just "Lei" or price without item
  if (/^\d+\s*(lei|ron)$/i.test(line)) return false;

  return true;
}

export function extractWinesAndFoodsFromDescription(rawDescription: string): ExtractedLists {
  const lines = normalizeToLines(rawDescription);
  
  const result: ExtractedLists = {
    wines: [],
    foods: []
  };

  let currentSection: 'none' | 'wine' | 'food' = 'none';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Detect Header Change
    if (isWineHeader(line)) {
      currentSection = 'wine';
      continue; // Skip the header line itself
    }
    
    if (isFoodHeader(line)) {
      currentSection = 'food';
      continue; // Skip the header line itself
    }

    // 2. Check Stop Condition
    // If we are currently collecting, check if we hit a footer/stop line
    if (currentSection !== 'none' && isStopCondition(line)) {
      currentSection = 'none';
      continue;
    }

    // 3. Collect Items
    if (currentSection !== 'none') {
      if (isValidItem(line)) {
        const cleaned = cleanItem(line);
        if (currentSection === 'wine') {
          result.wines.push(cleaned);
        } else {
          result.foods.push(cleaned);
        }
      }
    }
  }

  return result;
}