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
        sku: "fati_002",
        name: "Standard Kit (Cards + Tasbih + Lanyard)",
        price: 559,
        weightKg: 0.12,
        weightLabel: "120gm",
        image: "product/card/559-1.webp",
        hasJanamaz: false,
        freeShipping: false
      },
      {
        sku: "fati_001",
        name: "Full Companion Kit (Cards + Tasbih + Lanyard + Zipper Pouch)",
        price: 699,
        weightKg: 0.15,
        weightLabel: "150gm",
        image: "product/card/699-1.webp",
        hasJanamaz: false,
        freeShipping: false
      },
      {
        sku: "fati_013",
        name: "Combo Kit (Cards + Tasbih + Lanyard + Travel Janamaz)",
        price: 799,
        weightKg: 0.23,
        weightLabel: "230gm",
        image: "product/card/559-1.webp",
        hasJanamaz: true,
        freeShipping: true
      },
      {
        sku: "fati_003",
        name: "Mega Combo Kit (Cards + Tasbih + Lanyard + Pouch + Travel Janamaz)",
        price: 899,
        weightKg: 0.26,
        weightLabel: "260gm",
        image: "product/card/699-1.webp",
        hasJanamaz: true,
        freeShipping: true
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
        sku: "fati_005",
        name: "Standard Kit (Cards + Tasbih + Lanyard)",
        price: 559,
        weightKg: 0.12,
        weightLabel: "120gm",
        image: "product/card/559-1.webp",
        hasJanamaz: false,
        freeShipping: false
      },
      {
        sku: "fati_004",
        name: "Full Companion Kit (Cards + Tasbih + Lanyard + Zipper Pouch)",
        price: 699,
        weightKg: 0.15,
        weightLabel: "150gm",
        image: "product/card/699-1.webp",
        hasJanamaz: false,
        freeShipping: false
      },
      {
        sku: "fati_014",
        name: "Combo Kit (Cards + Tasbih + Lanyard + Travel Janamaz)",
        price: 799,
        weightKg: 0.23,
        weightLabel: "230gm",
        image: "product/card/559-1.webp",
        hasJanamaz: true,
        freeShipping: true
      },
      {
        sku: "fati_006",
        name: "Mega Combo Kit (Cards + Tasbih + Lanyard + Pouch + Travel Janamaz)",
        price: 899,
        weightKg: 0.26,
        weightLabel: "260gm",
        image: "product/card/699-1.webp",
        hasJanamaz: true,
        freeShipping: true
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
        sku: "fati_008",
        name: "Standard Kit (Cards + Tasbih + Lanyard)",
        price: 559,
        weightKg: 0.12,
        weightLabel: "120gm",
        image: "product/card/559-1.webp",
        hasJanamaz: false,
        freeShipping: false
      },
      {
        sku: "fati_007",
        name: "Full Companion Kit (Cards + Tasbih + Lanyard + Zipper Pouch)",
        price: 699,
        weightKg: 0.15,
        weightLabel: "150gm",
        image: "product/card/699-1.webp",
        hasJanamaz: false,
        freeShipping: false
      },
      {
        sku: "fati_015",
        name: "Combo Kit (Cards + Tasbih + Lanyard + Travel Janamaz)",
        price: 799,
        weightKg: 0.23,
        weightLabel: "230gm",
        image: "product/card/559-1.webp",
        hasJanamaz: true,
        freeShipping: true
      },
      {
        sku: "fati_009",
        name: "Mega Combo Kit (Cards + Tasbih + Lanyard + Pouch + Travel Janamaz)",
        price: 899,
        weightKg: 0.26,
        weightLabel: "260gm",
        image: "product/card/699-1.webp",
        hasJanamaz: true,
        freeShipping: true
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
        sku: "fati_011",
        name: "Standard Kit (Cards + Tasbih + Lanyard)",
        price: 559,
        weightKg: 0.12,
        weightLabel: "120gm",
        image: "product/card/559-1.webp",
        hasJanamaz: false,
        freeShipping: false
      },
      {
        sku: "fati_010",
        name: "Full Companion Kit (Cards + Tasbih + Lanyard + Zipper Pouch)",
        price: 699,
        weightKg: 0.15,
        weightLabel: "150gm",
        image: "product/card/699-1.webp",
        hasJanamaz: false,
        freeShipping: false
      },
      {
        sku: "fati_016",
        name: "Combo Kit (Cards + Tasbih + Lanyard + Travel Janamaz)",
        price: 799,
        weightKg: 0.23,
        weightLabel: "230gm",
        image: "product/card/559-1.webp",
        hasJanamaz: true,
        freeShipping: true
      },
      {
        sku: "fati_012",
        name: "Mega Combo Kit (Cards + Tasbih + Lanyard + Pouch + Travel Janamaz)",
        price: 899,
        weightKg: 0.26,
        weightLabel: "260gm",
        image: "product/card/699-1.webp",
        hasJanamaz: true,
        freeShipping: true
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
        weightLabel: "30gm",
        hasJanamaz: false,
        freeShipping: false
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
        weightLabel: "30gm",
        hasJanamaz: false,
        freeShipping: false
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
        weightLabel: "30gm",
        hasJanamaz: false,
        freeShipping: false
      }
    ]
  }
];

// Helper to look up an item by SKU
function findItemBySku(sku) {
  for (const product of catalog) {
    if (product.variants) {
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
            weightLabel: variant.weightLabel,
            hasJanamaz: !!variant.hasJanamaz,
            freeShipping: !!variant.freeShipping,
            image: variant.image || product.image
          };
        }
      }
    } else if (product.sku === sku) {
      return {
        productId: product.id,
        productName: product.name,
        category: product.category,
        hsn: product.hsn,
        dimensions: product.dimensions,
        sku: product.sku,
        variantName: product.name,
        unitPrice: product.price,
        weightKg: product.weightKg,
        weightLabel: product.weightLabel,
        hasJanamaz: false,
        freeShipping: false,
        image: product.image
      };
    }
  }
  return null;
}

module.exports = {
  catalog,
  findItemBySku
};
