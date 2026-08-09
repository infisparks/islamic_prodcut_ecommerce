/**
 * Authoritative Server-Side Product Catalog
 * The server is the sole source of truth for pricing, weights, dimensions, and HSN codes.
 * Client-submitted prices, weights, or amounts are NEVER trusted.
 */

const catalog = [
  {
    id: 1,
    name: "Umrah Dua & Guide Cards (Urdu / اردو)",
    category: "card",
    hsn: "4910",
    dimensions: { length: 15, breadth: 10, height: 2.5 }, // cm for Shiprocket
    variants: [
      {
        sku: "fati_001",
        name: "Full Companion Kit (Cards + Tasbih + Lanyard + Zipper Pouch)",
        price: 699,
        weightKg: 0.15,
        weightLabel: "150gm"
      },
      {
        sku: "fati_002",
        name: "Standard Kit (Cards + Tasbih + Lanyard)",
        price: 589,
        weightKg: 0.12,
        weightLabel: "120gm"
      },
      {
        sku: "fati_003",
        name: "Essential Pack (Cards + Tawaf Tasbih)",
        price: 491,
        weightKg: 0.10,
        weightLabel: "100gm"
      }
    ]
  },
  {
    id: 2,
    name: "Umrah Dua & Guide Cards (English)",
    category: "card",
    hsn: "4910",
    dimensions: { length: 15, breadth: 10, height: 2.5 },
    variants: [
      {
        sku: "fati_004",
        name: "Full Companion Kit (Cards + Tasbih + Lanyard + Zipper Pouch)",
        price: 699,
        weightKg: 0.15,
        weightLabel: "150gm"
      },
      {
        sku: "fati_005",
        name: "Standard Kit (Cards + Tasbih + Lanyard)",
        price: 589,
        weightKg: 0.12,
        weightLabel: "120gm"
      },
      {
        sku: "fati_006",
        name: "Essential Pack (Cards + Tawaf Tasbih)",
        price: 491,
        weightKg: 0.10,
        weightLabel: "100gm"
      }
    ]
  },
  {
    id: 3,
    name: "Umrah Dua & Guide Cards (Hindi / हिंदी)",
    category: "card",
    hsn: "4910",
    dimensions: { length: 15, breadth: 10, height: 2.5 },
    variants: [
      {
        sku: "fati_007",
        name: "Full Companion Kit (Cards + Tasbih + Lanyard + Zipper Pouch)",
        price: 699,
        weightKg: 0.15,
        weightLabel: "150gm"
      },
      {
        sku: "fati_008",
        name: "Standard Kit (Cards + Tasbih + Lanyard)",
        price: 589,
        weightKg: 0.12,
        weightLabel: "120gm"
      },
      {
        sku: "fati_009",
        name: "Essential Pack (Cards + Tawaf Tasbih)",
        price: 491,
        weightKg: 0.10,
        weightLabel: "100gm"
      }
    ]
  },
  {
    id: 4,
    name: "Umrah Dua & Guide Cards (Roman English)",
    category: "card",
    hsn: "4910",
    dimensions: { length: 15, breadth: 10, height: 2.5 },
    variants: [
      {
        sku: "fati_010",
        name: "Full Companion Kit (Cards + Tasbih + Lanyard + Zipper Pouch)",
        price: 699,
        weightKg: 0.15,
        weightLabel: "150gm"
      },
      {
        sku: "fati_011",
        name: "Standard Kit (Cards + Tasbih + Lanyard)",
        price: 589,
        weightKg: 0.12,
        weightLabel: "120gm"
      },
      {
        sku: "fati_012",
        name: "Essential Pack (Cards + Tawaf Tasbih)",
        price: 491,
        weightKg: 0.10,
        weightLabel: "100gm"
      }
    ]
  },
  {
    id: 5,
    name: "Dua Sticker (English)",
    category: "sticker",
    hsn: "4910",
    dimensions: { length: 10, breadth: 8, height: 0.5 },
    variants: [
      {
        sku: "fati_stk_01",
        name: "Compact Peel & Stick (English)",
        price: 199,
        weightKg: 0.03,
        weightLabel: "30gm"
      }
    ]
  },
  {
    id: 6,
    name: "Dua Sticker (Hindi / हिंदी)",
    category: "sticker",
    hsn: "4910",
    dimensions: { length: 10, breadth: 8, height: 0.5 },
    variants: [
      {
        sku: "fati_stk_02",
        name: "Compact Peel & Stick (Hindi)",
        price: 199,
        weightKg: 0.03,
        weightLabel: "30gm"
      }
    ]
  },
  {
    id: 7,
    name: "Dua Sticker (Urdu / اردو)",
    category: "sticker",
    hsn: "4910",
    dimensions: { length: 10, breadth: 8, height: 0.5 },
    variants: [
      {
        sku: "fati_stk_03",
        name: "Compact Peel & Stick (Urdu)",
        price: 199,
        weightKg: 0.03,
        weightLabel: "30gm"
      }
    ]
  }
];

// Helper to look up an item by SKU
function findItemBySku(sku) {
  for (const product of catalog) {
    for (const variant of product.variants) {
      if (variant.sku === sku) {
        return {
          productId: product.id,
          productName: product.name,
          category: product.category,
          hsn: product.hsn,
          dimensions: product.dimensions,
          sku: variant.sku,
          variantName: variant.name,
          unitPrice: variant.price,
          weightKg: variant.weightKg,
          weightLabel: variant.weightLabel
        };
      }
    }
  }
  return null;
}

module.exports = {
  catalog,
  findItemBySku
};
