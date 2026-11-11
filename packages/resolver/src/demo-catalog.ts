import type { RetailProduct } from '@haul/core';
import { fixtureProduct, SAMPLE_CATALOG } from './fixtures';

/**
 * Wider offline catalog for DEMO_MODE, so the app is usable without Kroger keys.
 * Rows: id | description | brand | size | price | category. Prices are illustrative.
 */
const ROWS = `
100|Roma Tomatoes|Kroger|1 lb|1.49|Produce
101|Vine Ripe Tomatoes|Kroger|1 each|0.89|Produce
102|Russet Potatoes|Kroger|5 lb|3.99|Produce
103|Yukon Gold Potatoes|Kroger|3 lb|3.79|Produce
104|Carrots|Kroger|2 lb|1.69|Produce
105|Celery|Kroger|1 each|1.99|Produce
106|Red Bell Pepper|Kroger|1 each|1.29|Produce
107|Green Bell Pepper|Kroger|1 each|0.89|Produce
108|Jalapeno Pepper|Kroger|1 each|0.15|Produce
109|Fresh Cilantro|Kroger|1 each|0.99|Produce
110|Italian Parsley|Kroger|1 each|1.29|Produce
111|Fresh Basil|Kroger|0.75 oz|2.49|Produce
112|Limes|Kroger|1 each|0.33|Produce
113|Lemons|Kroger|1 each|0.69|Produce
114|Hass Avocado|Kroger|1 each|1.25|Produce
115|Baby Spinach|Simple Truth Organic|5 oz|3.49|Produce
116|Green Onions|Kroger|1 each|0.79|Produce
117|White Mushrooms|Kroger|8 oz|2.29|Produce
118|Zucchini|Kroger|1 each|0.99|Produce
119|Fresh Ginger Root|Kroger|4 oz|1.20|Produce
120|Red Onion|Kroger|1 each|1.19|Produce
121|Shallots|Kroger|8 oz|2.99|Produce
122|Broccoli Crowns|Kroger|1 lb|1.99|Produce
123|Bananas|Kroger|1 each|0.25|Produce
124|Gala Apples|Kroger|3 lb|4.49|Produce
125|Sweet Potatoes|Kroger|1 each|1.15|Produce
126|Cucumber|Kroger|1 each|0.79|Produce
127|Romaine Hearts|Kroger|3 ct|3.99|Produce
128|Fresh Thyme|Kroger|0.75 oz|2.49|Produce
129|Kale|Kroger|1 each|1.99|Produce
200|Boneless Skinless Chicken Breasts|Kroger|1.5 lb|6.74|Meat & Seafood
201|Boneless Skinless Chicken Thighs|Kroger|1.5 lb|5.24|Meat & Seafood
202|Simple Truth Organic Chicken Breasts|Simple Truth Organic|1 lb|7.99|Meat & Seafood
203|Ground Turkey 93% Lean|Kroger|1 lb|5.29|Meat & Seafood
204|Thick Cut Bacon|Kroger|16 oz|6.99|Meat & Seafood
205|Italian Pork Sausage|Kroger|19 oz|5.49|Meat & Seafood
206|Atlantic Salmon Fillet|Kroger|1 lb|10.99|Meat & Seafood
207|Raw Shrimp Peeled Deveined|Kroger|1 lb|9.99|Meat & Seafood
208|Boneless Pork Chops|Kroger|1.5 lb|6.29|Meat & Seafood
209|Chicken Breast Seasoned Fajita Strips|Kroger|1 lb|7.49|Meat & Seafood
300|Grade A Large Eggs|Kroger|12 ct|2.79|Dairy
301|Grade A Large Eggs|Kroger|18 ct|3.99|Dairy
302|2% Reduced Fat Milk|Kroger|1 gal|3.49|Dairy
303|Whole Milk|Kroger|0.5 gal|2.29|Dairy
304|Unsalted Butter Sticks|Kroger|16 oz|4.29|Dairy
305|Salted Butter Sticks|Kroger|16 oz|4.29|Dairy
306|Heavy Whipping Cream|Kroger|16 fl oz|3.79|Dairy
307|Sour Cream|Kroger|16 oz|1.99|Dairy
308|Shredded Mozzarella Cheese|Kroger|8 oz|2.79|Dairy
309|Grated Parmesan Cheese|Kroger|8 oz|4.49|Dairy
310|Plain Greek Yogurt|Kroger|32 oz|4.99|Dairy
311|Crumbled Feta Cheese|Kroger|4 oz|2.99|Dairy
312|Whole Milk Ricotta Cheese|Kroger|15 oz|3.49|Dairy
313|Cream Cheese|Kroger|8 oz|1.99|Dairy
400|French Baguette|Kroger|1 each|2.49|Bakery
401|Flour Tortillas Burrito Size|Kroger|8 ct|2.99|Bakery
402|Corn Tortillas|Kroger|30 ct|2.49|Bakery
403|Hamburger Buns|Kroger|8 ct|1.99|Bakery
404|Panko Bread Crumbs|Kroger|8 oz|2.29|Baking Goods
500|All Purpose Flour|Kroger|5 lb|2.99|Baking Goods
501|Granulated Sugar|Kroger|4 lb|3.49|Baking Goods
502|Light Brown Sugar|Kroger|2 lb|2.49|Baking Goods
503|Baking Soda|Arm & Hammer|16 oz|1.29|Baking Goods
504|Baking Powder|Clabber Girl|8.1 oz|2.49|Baking Goods
505|Pure Vanilla Extract|Kroger|2 fl oz|6.99|Baking Goods
506|Semi Sweet Chocolate Chips|Kroger|12 oz|2.99|Baking Goods
507|Active Dry Yeast|Fleischmann's|0.75 oz|1.79|Baking Goods
508|Pure Honey|Kroger|12 oz|4.49|Baking Goods
509|Old Fashioned Rolled Oats|Kroger|42 oz|4.29|Breakfast
600|Extra Virgin Olive Oil|Kroger|16.9 fl oz|6.99|Condiment & Sauces
601|Vegetable Oil|Kroger|48 fl oz|4.49|Condiment & Sauces
602|Low Sodium Soy Sauce|Kikkoman|10 fl oz|3.29|Condiment & Sauces
603|Apple Cider Vinegar|Kroger|32 fl oz|2.29|Condiment & Sauces
604|Red Wine Vinegar|Kroger|16 fl oz|1.99|Condiment & Sauces
605|Dijon Mustard|Grey Poupon|8 oz|3.49|Condiment & Sauces
606|Mayonnaise|Kroger|30 fl oz|3.99|Condiment & Sauces
607|Toasted Sesame Oil|Kroger|5 fl oz|3.99|Condiment & Sauces
608|Sriracha Hot Chili Sauce|Huy Fong|17 oz|4.99|Condiment & Sauces
609|Pure Maple Syrup|Kroger|12.5 fl oz|7.49|Breakfast
610|Marinara Pasta Sauce|Kroger|24 oz|1.99|Pasta, Sauces, Grain
611|Spaghetti|Kroger|16 oz|1.19|Pasta, Sauces, Grain
612|Penne Rigate|Kroger|16 oz|1.19|Pasta, Sauces, Grain
613|Long Grain White Rice|Kroger|2 lb|1.99|Pasta, Sauces, Grain
614|Jasmine Rice|Kroger|2 lb|3.49|Pasta, Sauces, Grain
615|Quinoa|Simple Truth|16 oz|4.49|Pasta, Sauces, Grain
616|Lasagna Noodles|Kroger|16 oz|1.79|Pasta, Sauces, Grain
617|Brown Lentils|Kroger|16 oz|1.49|Pasta, Sauces, Grain
700|Chicken Broth|Kroger|32 fl oz|1.99|Canned & Packaged
701|Low Sodium Chicken Broth|Kroger|32 fl oz|1.99|Canned & Packaged
702|Vegetable Broth|Kroger|32 fl oz|1.99|Canned & Packaged
703|Beef Broth|Kroger|32 fl oz|1.99|Canned & Packaged
704|Tomato Paste|Kroger|6 oz|0.79|Canned & Packaged
705|Black Beans|Kroger|15 oz|0.89|Canned & Packaged
706|Garbanzo Beans Chickpeas|Kroger|15.5 oz|0.89|Canned & Packaged
707|Coconut Milk|Thai Kitchen|13.66 fl oz|2.79|International
708|Sweet Corn Whole Kernel|Kroger|15.25 oz|0.79|Canned & Packaged
709|Cream of Chicken Soup|Campbell's|10.5 oz|1.49|Canned & Packaged
710|Fire Roasted Diced Tomatoes|Kroger|14.5 oz|1.29|Canned & Packaged
711|Chipotle Peppers in Adobo Sauce|La Costena|7 oz|1.99|International
712|Green Enchilada Sauce|Old El Paso|10 oz|2.49|International
713|Smooth Peanut Butter|Kroger|16 oz|2.29|Condiment & Sauces
800|Smoked Paprika|McCormick|1.75 oz|4.49|Spices & Seasonings
801|Paprika|Kroger|2.5 oz|2.49|Spices & Seasonings
802|Dried Oregano Leaves|Kroger|0.75 oz|2.29|Spices & Seasonings
803|Ground Cinnamon|Kroger|2.37 oz|2.49|Spices & Seasonings
804|Crushed Red Pepper Flakes|Kroger|1.5 oz|2.29|Spices & Seasonings
805|Onion Powder|Kroger|2.6 oz|2.49|Spices & Seasonings
806|Ground Turmeric|McCormick|0.95 oz|4.29|Spices & Seasonings
807|Cayenne Pepper|Kroger|1.75 oz|2.49|Spices & Seasonings
808|Italian Seasoning|Kroger|0.87 oz|2.29|Spices & Seasonings
809|Bay Leaves|McCormick|0.12 oz|4.99|Spices & Seasonings
810|Ground Nutmeg|McCormick|1.1 oz|5.49|Spices & Seasonings
811|Garam Masala|McCormick|1.87 oz|5.99|Spices & Seasonings
812|Taco Seasoning Mix|Kroger|1 oz|0.79|Spices & Seasonings
900|Frozen Sweet Peas|Kroger|12 oz|1.29|Frozen
901|Frozen Broccoli Florets|Kroger|12 oz|1.49|Frozen
902|Frozen Mixed Berries|Kroger|16 oz|3.99|Frozen
903|Frozen Shelled Edamame|Kroger|12 oz|2.29|Frozen
950|Dry White Wine Sauvignon Blanc|Barefoot|750 ml|6.99|Beer, Wine & Spirits
951|Dry Red Wine Cabernet Sauvignon|Barefoot|750 ml|6.99|Beer, Wine & Spirits
`;

const SAMPLE_CATEGORIES: Record<string, string> = {
  '1': 'Canned & Packaged', '2': 'Canned & Packaged', '3': 'Canned & Packaged', '4': 'Canned & Packaged', '5': 'Canned & Packaged',
  '10': 'Meat & Seafood', '11': 'Meat & Seafood', '12': 'Meat & Seafood', '13': 'Meat & Seafood',
  '20': 'Produce', '21': 'Produce', '22': 'Dairy', '30': 'Canned & Packaged', '31': 'Canned & Packaged',
  '40': 'Spices & Seasonings', '41': 'Spices & Seasonings', '42': 'Spices & Seasonings',
  '50': 'Produce', '51': 'Produce', '52': 'Spices & Seasonings', '60': 'Dairy', '61': 'Dairy',
  '70': 'Spices & Seasonings', '71': 'Spices & Seasonings',
};

const extras = ROWS.trim()
  .split('\n')
  .map((row) => {
    const [id, description, brand, size, price, category] = row.split('|');
    return fixtureProduct(id!, description!, brand!, size!, Number(price), 'in', category!);
  });

export const DEMO_CATALOG: RetailProduct[] = [
  ...SAMPLE_CATALOG.map((p) => ({ ...p, categories: SAMPLE_CATEGORIES[p.productId] ? [SAMPLE_CATEGORIES[p.productId]!] : [] })),
  ...extras,
];

export const DEMO_STORES = [
  { locationId: '01400943', name: 'Kroger Marketplace', chain: 'KROGER', address: { addressLine1: '1014 Vine St', city: 'Cincinnati', state: 'OH', zipCode: '45202' } },
  { locationId: '01400376', name: 'Kroger', chain: 'KROGER', address: { addressLine1: '2900 Woodburn Ave', city: 'Cincinnati', state: 'OH', zipCode: '45206' } },
  { locationId: '01400512', name: 'Kroger Fresh Fare', chain: 'KROGER', address: { addressLine1: '4777 Kenard Ave', city: 'Cincinnati', state: 'OH', zipCode: '45232' } },
];
