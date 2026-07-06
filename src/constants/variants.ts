// Definitivní sada velikostí koulí do koupele (hmotnost v gramech) a jednotný ceník.
// Jediný zdroj pravdy pro povolené varianty na backendu.
export interface VariantPrice {
  weight: number
  price: number
}

// Jednotný ceník platný pro všechny koule.
export const BOMB_PRICING: VariantPrice[] = [
  { weight: 40, price: 35 },
  { weight: 70, price: 55 },
  { weight: 110, price: 72 },
  { weight: 115, price: 75 },
  { weight: 140, price: 85 },
  { weight: 180, price: 100 },
]

// Povolené hmotnosti (gramy) odvozené z ceníku.
export const ALLOWED_BOMB_WEIGHTS: number[] = BOMB_PRICING.map((p) => p.weight)

export const priceForWeight = (weight: number): number =>
  BOMB_PRICING.find((p) => p.weight === weight)?.price ?? 0
