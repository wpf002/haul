import type { Aisle, RetailProduct, ShoppingNeed } from '@haul/core';

/** Retailer category text -> aisle. First match wins, so specific rules go first. */
const CATEGORY_RULES: Array<[RegExp, Aisle]> = [
  [/frozen/i, 'Frozen'],
  [/produce|fruit|vegetable/i, 'Produce'],
  [/meat|seafood|poultry|deli/i, 'Meat & Seafood'],
  [/dairy|egg|cheese/i, 'Dairy & Eggs'],
  [/bakery|bread/i, 'Bakery'],
  [/spice|seasoning/i, 'Spices'],
  [/canned|soup/i, 'Canned Goods'],
  [/beverage|drink|wine|beer|spirits|coffee|tea/i, 'Drinks'],
  [/baking|pasta|grain|rice|condiment|sauce|oil|snack|breakfast|international|pantry/i, 'Pantry'],
];

/** Ingredient name -> aisle, for lines with no product (Instacart) or uncategorized products. */
const NAME_RULES: Array<[RegExp, Aisle]> = [
  [/\bfrozen\b/, 'Frozen'],
  [/\b(powder|cumin|paprika|oregano|cinnamon|nutmeg|thyme|chili flakes|red pepper flakes|bay lea|coriander seed|turmeric|cayenne|seasoning|allspice|clove|black pepper|peppercorn)\b/, 'Spices'],
  [/\b(canned|crushed tomato|diced tomato|tomato paste|tomato sauce|bean|chickpea|coconut milk|broth|stock)\b/, 'Canned Goods'],
  [/\b(beef|chicken|pork|turkey|lamb|bacon|sausage|salmon|shrimp|fish|tuna|cod|ham|steak|thigh|breast)\b/, 'Meat & Seafood'],
  [/\b(milk|cream|butter|cheese|cheddar|mozzarella|parmesan|yogurt|egg|sour cream|feta|ricotta)\b/, 'Dairy & Eggs'],
  [/\b(bread|bun|tortilla|baguette|pita|roll)\b/, 'Bakery'],
  [/\b(wine|beer|juice|soda|coffee|tea)\b/, 'Drinks'],
  [/\b(onion|garlic|tomato|potato|carrot|celery|pepper|lettuce|spinach|kale|lemon|lime|apple|banana|avocado|cilantro|parsley|basil|mint|ginger|scallion|green onion|mushroom|zucchini|cucumber|broccoli|cabbage|jalape|berr|herb)/, 'Produce'],
  [/\b(flour|sugar|oil|vinegar|rice|pasta|noodle|oat|honey|syrup|sauce|soy|salt|baking|yeast|nut|seed|cereal|cracker|chocolate|vanilla)/, 'Pantry'],
];

export function aisleOf(need: ShoppingNeed, pick: RetailProduct | null): Aisle {
  for (const category of pick?.categories ?? []) {
    const hit = CATEGORY_RULES.find(([re]) => re.test(category));
    if (hit) return hit[1];
  }
  const hit = NAME_RULES.find(([re]) => re.test(need.name.toLowerCase()));
  return hit ? hit[1] : 'Other';
}
