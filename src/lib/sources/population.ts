/**
 * PSA population data source.
 * Replace with PSA API or scraped pop report when ready.
 */

export interface PopulationSource {
  getPopulation(cardKey: string): Promise<number | null>;
}

const mockPopByKey: Record<string, number> = {
  "2023-topps-chrome-ohtani-1-10": 1240,
  "2023-topps-chrome-ohtani-1-9": 3100,
  "2022-bowman-chrome-jrod-1-10": 890,
  "2022-bowman-chrome-jrod-1-9": 2100,
  "2024-topps-soto-1-10": 420,
  "2024-topps-soto-1-9": 1100,
};

export const mockPopulationSource: PopulationSource = {
  async getPopulation(cardKey: string) {
    return mockPopByKey[cardKey] ?? 1500 + Math.abs(cardKey.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 2000);
  },
};
