// Ingredients for the Kitchen recipes (owner, Nov 2026). Each one points to
// its Israeli Ministry of Health food (`moh` = code in foods-il.json), so a
// recipe's nutrition is worked out per gram from the same national database
// as the Food tab. Raw / as-bought forms. A few spices the database doesn't
// have use USDA FoodData Central values (`per100`, source noted).
//
// kosher: meat (בשרי) / dairy (חלבי) / parve (פרווה). Fish and eggs are parve.
// aisle: where it is in an Israeli supermarket (for the shopping list).
// piece: grams of one (an egg, an onion…) so recipes can say "2 eggs".
// swaps: ingredients that work instead in the same recipes (taste-tested
// common kitchen substitutions; never vegan meat substitutes, owner's rule).

export type Kosher = 'meat' | 'dairy' | 'parve';
export type IngGroup = 'poultry' | 'meat' | 'fish' | 'egg' | 'dairy' | 'legume' | 'grain' | 'veg' | 'fruit' | 'fat' | 'nut' | 'spice' | 'herb' | 'sauce' | 'sweet' | 'other';
export type Aisle = 'meat' | 'fish' | 'dairy' | 'produce' | 'bakery' | 'dry' | 'cans' | 'spices' | 'oils' | 'frozen';

export interface Ingredient {
  id: string;
  he: string;
  en: string;
  moh: number;
  kosher: Kosher;
  group: IngGroup;
  aisle: Aisle;
  piece?: number;
  /** Hebrew / English word for one piece ("ביצה" / "egg"). */
  pieceHe?: string;
  pieceEn?: string;
  swaps?: string[];
  /** Only when the MoH database doesn't have it: per 100 g (USDA FoodData Central). */
  per100?: { kcal: number; protein: number; fat: number; carbs: number; sugars?: number; fiber?: number; satFat?: number; sodium?: number };
}

const I = (
  id: string,
  he: string,
  en: string,
  moh: number,
  kosher: Kosher,
  group: IngGroup,
  aisle: Aisle,
  extra: Partial<Pick<Ingredient, 'piece' | 'pieceHe' | 'pieceEn' | 'swaps' | 'per100'>> = {},
): Ingredient => ({ id, he, en, moh, kosher, group, aisle, ...extra });

export const INGREDIENTS: Ingredient[] = [
  // ---- poultry, meat
  I('chicken-breast', 'חזה עוף', 'Chicken breast', 24123130, 'meat', 'poultry', 'meat', { swaps: ['turkey-breast', 'chicken-thigh'] }),
  I('chicken-thigh', 'פרגית (ירך עוף ללא עור)', 'Chicken thigh, skinless', 24133240, 'meat', 'poultry', 'meat', { swaps: ['chicken-breast', 'turkey-thigh'] }),
  I('turkey-breast', 'חזה הודו', 'Turkey breast', 24201040, 'meat', 'poultry', 'meat', { swaps: ['chicken-breast'] }),
  I('turkey-thigh', 'שוק הודו', 'Turkey thigh', 24201250, 'meat', 'poultry', 'meat', { swaps: ['chicken-thigh'] }),
  I('chicken-ground', 'עוף טחון', 'Ground chicken', 24198709, 'meat', 'poultry', 'meat', { swaps: ['beef-ground'] }),
  I('beef-ground', 'בשר בקר טחון', 'Ground beef', 21500000, 'meat', 'meat', 'meat', { swaps: ['chicken-ground', 'lamb-ground'] }),
  I('beef-sirloin', 'סינטה בקר', 'Beef sirloin', 21100269, 'meat', 'meat', 'meat', { swaps: ['chicken-thigh'] }),
  I('lamb-ground', 'טלה טחון', 'Ground lamb', 23132009, 'meat', 'meat', 'meat', { swaps: ['beef-ground'] }),
  // ---- fish, eggs (parve)
  I('salmon', 'סלמון', 'Salmon fillet', 26137100, 'parve', 'fish', 'fish', { swaps: ['sea-bream', 'tilapia'] }),
  I('tilapia', 'אמנון (פילה)', 'Tilapia fillet', 26157990, 'parve', 'fish', 'fish', { swaps: ['cod', 'sea-bream'] }),
  I('sea-bream', 'דניס', 'Sea bream', 26100109, 'parve', 'fish', 'fish', { swaps: ['tilapia', 'salmon'] }),
  I('cod', 'בקלה (הייק)', 'Cod (hake)', 26109230, 'parve', 'fish', 'fish', { swaps: ['tilapia'] }),
  I('tuna-can', 'טונה במים', 'Tuna in water', 26155190, 'parve', 'fish', 'cans', { swaps: ['salmon'] }),
  I('egg', 'ביצה', 'Egg', 31101010, 'parve', 'egg', 'dairy', { piece: 55, pieceHe: 'ביצה', pieceEn: 'egg' }),
  I('egg-white', 'חלבון ביצה', 'Egg white', 31108010, 'parve', 'egg', 'dairy', { piece: 33, pieceHe: 'חלבון', pieceEn: 'egg white' }),
  // ---- dairy
  I('cottage', 'קוטג׳ 5%', 'Cottage cheese 5%', 14201019, 'dairy', 'dairy', 'dairy', { swaps: ['white-cheese'] }),
  I('white-cheese', 'גבינה לבנה 5%', 'White cheese 5%', 14210099, 'dairy', 'dairy', 'dairy', { swaps: ['cottage', 'labneh'] }),
  I('labneh', 'לבנה 5%', 'Labneh 5%', 11443139, 'dairy', 'dairy', 'dairy', { swaps: ['white-cheese'] }),
  I('yogurt', 'יוגורט 3% טבעי', 'Plain yogurt 3%', 11411409, 'dairy', 'dairy', 'dairy', { swaps: ['yogurt-0'] }),
  I('yogurt-0', 'יוגורט 0% טבעי', 'Plain yogurt 0%', 11411339, 'dairy', 'dairy', 'dairy', { swaps: ['yogurt'] }),
  I('milk', 'חלב 1%', 'Milk 1%', 11111029, 'dairy', 'dairy', 'dairy', { swaps: ['soy-drink'] }),
  I('feta', 'פטה 5%', 'Feta 5%', 14104699, 'dairy', 'dairy', 'dairy', { swaps: ['white-cheese'] }),
  I('yellow-cheese', 'גבינה צהובה 5%', 'Yellow cheese 5%', 14105079, 'dairy', 'dairy', 'dairy', { swaps: ['mozzarella'] }),
  I('mozzarella', 'מוצרלה', 'Mozzarella', 14103009, 'dairy', 'dairy', 'dairy', { swaps: ['yellow-cheese'] }),
  I('parmesan', 'פרמזן', 'Parmesan', 14010139, 'dairy', 'dairy', 'dairy', { swaps: ['yellow-cheese'] }),
  I('butter', 'חמאה', 'Butter', 81101100, 'dairy', 'fat', 'dairy', { swaps: ['margarine', 'olive-oil'] }),
  I('soy-drink', 'משקה סויה', 'Soy drink', 41480339, 'parve', 'other', 'dairy', { swaps: ['milk'] }),
  I('margarine', 'מחמאה / מרגרינה', 'Margarine', 81102099, 'parve', 'fat', 'dairy', { swaps: ['butter', 'olive-oil'] }),
  // ---- legumes, grains, bread
  I('chickpeas-dry', 'גרגרי חומוס יבשים', 'Dried chickpeas', 41302030, 'parve', 'legume', 'dry', { swaps: ['white-beans-dry'] }),
  I('chickpeas-cooked', 'גרגרי חומוס מבושלים', 'Cooked chickpeas', 41302020, 'parve', 'legume', 'cans', { swaps: ['white-beans-cooked'] }),
  I('lentils', 'עדשים חומות יבשות', 'Brown lentils, dried', 41305030, 'parve', 'legume', 'dry'),
  // MoH has red lentils only cooked: dried values from USDA FoodData Central 174284 (lentils, pink or red, raw);
  // carbs without fiber, like the MoH table (63.1 - 10.8).
  I('red-lentils', 'עדשים כתומות', 'Red lentils', 0, 'parve', 'legume', 'dry', { swaps: ['lentils'], per100: { kcal: 358, protein: 23.9, fat: 2.2, carbs: 52.3, fiber: 10.8, sugars: 1.5, satFat: 0.4, sodium: 7 } }),
  I('white-beans-dry', 'שעועית לבנה יבשה', 'White beans, dried', 41101130, 'parve', 'legume', 'dry', { swaps: ['chickpeas-dry'] }),
  I('white-beans-cooked', 'שעועית לבנה מבושלת', 'White beans, cooked', 41101120, 'parve', 'legume', 'cans', { swaps: ['chickpeas-cooked'] }),
  I('tofu', 'טופו קשה', 'Firm tofu', 41420259, 'parve', 'legume', 'dairy', { swaps: ['chickpeas-cooked'] }),
  I('hummus', 'חומוס (ממרח)', 'Hummus', 41205119, 'parve', 'legume', 'dairy'),
  I('tahini', 'טחינה גולמית', 'Raw tahini', 43103339, 'parve', 'nut', 'dry'),
  I('rice', 'אורז לבן', 'White rice', 56205160, 'parve', 'grain', 'dry', { swaps: ['brown-rice', 'quinoa', 'bulgur'] }),
  I('brown-rice', 'אורז מלא', 'Brown rice', 56205100, 'parve', 'grain', 'dry', { swaps: ['rice', 'quinoa'] }),
  I('quinoa', 'קינואה', 'Quinoa', 56208050, 'parve', 'grain', 'dry', { swaps: ['bulgur', 'brown-rice'] }),
  I('bulgur', 'בורגול', 'Bulgur', 56207170, 'parve', 'grain', 'dry', { swaps: ['quinoa', 'couscous-ww'] }),
  I('couscous-ww', 'קוסקוס מלא', 'Whole wheat couscous', 56207259, 'parve', 'grain', 'dry', { swaps: ['bulgur', 'quinoa'] }),
  I('pasta', 'פסטה', 'Pasta', 56102030, 'parve', 'grain', 'dry', { swaps: ['pasta-ww'] }),
  I('pasta-ww', 'פסטה מקמח מלא', 'Whole wheat pasta', 56102040, 'parve', 'grain', 'dry', { swaps: ['pasta'] }),
  I('oats', 'שיבולת שועל', 'Rolled oats', 57602300, 'parve', 'grain', 'dry'),
  I('flour-ww', 'קמח מלא', 'Whole wheat flour', 50020000, 'parve', 'grain', 'dry', { swaps: ['flour'] }),
  I('flour', 'קמח לבן', 'White flour', 50010030, 'parve', 'grain', 'dry', { swaps: ['flour-ww'] }),
  I('breadcrumbs', 'פירורי לחם', 'Breadcrumbs', 51185029, 'parve', 'grain', 'dry', { swaps: ['cornflakes'] }),
  I('cornflakes', 'קורנפלקס', 'Cornflakes', 57134009, 'parve', 'grain', 'dry', { swaps: ['breadcrumbs'] }),
  I('pita-ww', 'פיתה מקמח מלא', 'Whole wheat pita', 51140519, 'parve', 'grain', 'bakery', { piece: 90, pieceHe: 'פיתה', pieceEn: 'pita', swaps: ['bread-ww', 'tortilla-ww'] }),
  I('bread-ww', 'לחם מלא', 'Whole wheat bread', 51200519, 'parve', 'grain', 'bakery', { piece: 30, pieceHe: 'פרוסה', pieceEn: 'slice', swaps: ['pita-ww'] }),
  I('tortilla-ww', 'טורטיה מקמח מלא', 'Whole wheat tortilla', 52215260, 'parve', 'grain', 'bakery', { piece: 60, pieceHe: 'טורטיה', pieceEn: 'tortilla', swaps: ['pita-ww'] }),
  I('potato', 'תפוח אדמה', 'Potato', 71001040, 'parve', 'veg', 'produce', { piece: 180, pieceHe: 'תפוח אדמה', pieceEn: 'potato', swaps: ['sweet-potato'] }),
  I('sweet-potato', 'בטטה', 'Sweet potato', 73402030, 'parve', 'veg', 'produce', { piece: 220, pieceHe: 'בטטה', pieceEn: 'sweet potato', swaps: ['potato', 'pumpkin'] }),
  // ---- vegetables, herbs
  I('tomato', 'עגבנייה', 'Tomato', 74101000, 'parve', 'veg', 'produce', { piece: 120, pieceHe: 'עגבנייה', pieceEn: 'tomato' }),
  I('crushed-tomatoes', 'עגבניות מרוסקות (שימורים)', 'Crushed tomatoes (can)', 74204530, 'parve', 'veg', 'cans'),
  I('tomato-paste', 'רסק עגבניות', 'Tomato paste', 74403159, 'parve', 'veg', 'cans'),
  I('cucumber', 'מלפפון', 'Cucumber', 75111030, 'parve', 'veg', 'produce', { piece: 120, pieceHe: 'מלפפון', pieceEn: 'cucumber' }),
  I('onion', 'בצל', 'Onion', 75117020, 'parve', 'veg', 'produce', { piece: 150, pieceHe: 'בצל', pieceEn: 'onion' }),
  I('spring-onion', 'בצל ירוק', 'Spring onion', 75117010, 'parve', 'veg', 'produce', { piece: 15, pieceHe: 'גבעול', pieceEn: 'stalk' }),
  I('garlic', 'שום', 'Garlic', 75111500, 'parve', 'veg', 'produce', { piece: 5, pieceHe: 'שן שום', pieceEn: 'clove' }),
  I('red-pepper', 'פלפל אדום', 'Red pepper', 75122200, 'parve', 'veg', 'produce', { piece: 160, pieceHe: 'פלפל', pieceEn: 'pepper', swaps: ['yellow-pepper'] }),
  I('yellow-pepper', 'פלפל צהוב', 'Yellow pepper', 75124030, 'parve', 'veg', 'produce', { piece: 160, pieceHe: 'פלפל', pieceEn: 'pepper', swaps: ['red-pepper'] }),
  I('chili', 'פלפל חריף', 'Hot chili pepper', 75121000, 'parve', 'veg', 'produce', { piece: 10, pieceHe: 'פלפל חריף', pieceEn: 'chili' }),
  I('zucchini', 'קישוא', 'Zucchini', 75128010, 'parve', 'veg', 'produce', { piece: 200, pieceHe: 'קישוא', pieceEn: 'zucchini', swaps: ['eggplant'] }),
  I('eggplant', 'חציל', 'Eggplant', 75111200, 'parve', 'veg', 'produce', { piece: 350, pieceHe: 'חציל', pieceEn: 'eggplant', swaps: ['zucchini'] }),
  I('carrot', 'גזר', 'Carrot', 73101010, 'parve', 'veg', 'produce', { piece: 70, pieceHe: 'גזר', pieceEn: 'carrot' }),
  I('broccoli', 'ברוקולי', 'Broccoli', 72201100, 'parve', 'veg', 'produce', { swaps: ['cauliflower'] }),
  I('cauliflower', 'כרובית', 'Cauliflower', 75107000, 'parve', 'veg', 'produce', { swaps: ['broccoli'] }),
  I('mushrooms', 'פטריות', 'Mushrooms', 75115000, 'parve', 'veg', 'produce'),
  I('spinach', 'תרד', 'Spinach', 72125100, 'parve', 'veg', 'produce', { swaps: ['kale'] }),
  I('kale', 'קייל', 'Kale', 72119230, 'parve', 'veg', 'produce', { swaps: ['spinach'] }),
  I('lettuce', 'חסה', 'Lettuce', 75113060, 'parve', 'veg', 'produce'),
  I('cabbage', 'כרוב לבן', 'White cabbage', 75103000, 'parve', 'veg', 'produce', { swaps: ['red-cabbage'] }),
  I('red-cabbage', 'כרוב סגול', 'Red cabbage', 75105000, 'parve', 'veg', 'produce', { swaps: ['cabbage'] }),
  I('green-beans', 'שעועית ירוקה', 'Green beans', 75302029, 'parve', 'veg', 'frozen'),
  I('peas', 'אפונה', 'Green peas', 75120000, 'parve', 'veg', 'frozen'),
  I('corn', 'תירס', 'Sweet corn', 75109600, 'parve', 'veg', 'cans'),
  I('pumpkin', 'דלעת', 'Pumpkin', 73201040, 'parve', 'veg', 'produce', { swaps: ['sweet-potato'] }),
  I('beet', 'סלק', 'Beet', 75102500, 'parve', 'veg', 'produce', { piece: 150, pieceHe: 'סלק', pieceEn: 'beet' }),
  I('celery', 'סלרי', 'Celery', 75109000, 'parve', 'veg', 'produce'),
  I('parsley', 'פטרוזיליה', 'Parsley', 75119000, 'parve', 'herb', 'produce', { swaps: ['cilantro'] }),
  I('cilantro', 'כוסברה', 'Cilantro', 75109550, 'parve', 'herb', 'produce', { swaps: ['parsley'] }),
  I('mint', 'נענע', 'Mint', 75119020, 'parve', 'herb', 'produce'),
  I('dill', 'שמיר', 'Dill', 75119010, 'parve', 'herb', 'produce'),
  I('basil', 'בזיליקום', 'Basil', 75119050, 'parve', 'herb', 'produce'),
  I('ginger', 'ג׳ינג׳ר', 'Ginger', 71961100, 'parve', 'spice', 'produce'),
  I('lemon-juice', 'מיץ לימון', 'Lemon juice', 61204010, 'parve', 'fruit', 'produce', { piece: 30, pieceHe: 'לימון (סחוט)', pieceEn: 'lemon (juice)' }),
  I('olives', 'זיתים', 'Olives', 75510000, 'parve', 'veg', 'cans'),
  I('avocado', 'אבוקדו', 'Avocado', 63105010, 'parve', 'fruit', 'produce', { piece: 140, pieceHe: 'אבוקדו', pieceEn: 'avocado' }),
  // ---- fruit, sweet
  I('banana', 'בננה', 'Banana', 63107010, 'parve', 'fruit', 'produce', { piece: 120, pieceHe: 'בננה', pieceEn: 'banana' }),
  I('apple', 'תפוח', 'Apple', 63101000, 'parve', 'fruit', 'produce', { piece: 180, pieceHe: 'תפוח', pieceEn: 'apple' }),
  I('strawberries', 'תותים', 'Strawberries', 63223020, 'parve', 'fruit', 'produce', { swaps: ['blueberries'] }),
  I('blueberries', 'אוכמניות', 'Blueberries', 63203010, 'parve', 'fruit', 'frozen', { swaps: ['strawberries'] }),
  I('dates', 'תמרים מג׳הול', 'Medjool dates', 62110110, 'parve', 'fruit', 'dry', { piece: 24, pieceHe: 'תמר', pieceEn: 'date' }),
  I('raisins', 'צימוקים', 'Raisins', 62125100, 'parve', 'fruit', 'dry'),
  I('pomegranate', 'רימון', 'Pomegranate seeds', 63145010, 'parve', 'fruit', 'produce'),
  I('honey', 'דבש', 'Honey', 91302010, 'parve', 'sweet', 'dry', { swaps: ['silan'] }),
  I('silan', 'סילאן', 'Date syrup (silan)', 91302039, 'parve', 'sweet', 'dry', { swaps: ['honey'] }),
  I('cocoa', 'אבקת קקאו', 'Cocoa powder', 11830150, 'parve', 'sweet', 'dry'),
  // ---- nuts, seeds, oils
  I('almonds', 'שקדים', 'Almonds', 42101130, 'parve', 'nut', 'dry', { swaps: ['walnuts'] }),
  I('walnuts', 'אגוזי מלך', 'Walnuts', 42116000, 'parve', 'nut', 'dry', { swaps: ['almonds'] }),
  I('pine-nuts', 'צנוברים', 'Pine nuts', 42113000, 'parve', 'nut', 'dry', { swaps: ['almonds'] }),
  I('sesame', 'שומשום', 'Sesame seeds', 43103050, 'parve', 'nut', 'dry'),
  I('peanut-butter', 'חמאת בוטנים', 'Peanut butter', 42202000, 'parve', 'nut', 'dry', { swaps: ['tahini'] }),
  I('olive-oil', 'שמן זית', 'Olive oil', 82104000, 'parve', 'fat', 'oils'),
  I('canola-oil', 'שמן קנולה', 'Canola oil', 82105500, 'parve', 'fat', 'oils', { swaps: ['olive-oil'] }),
  I('coconut-milk', 'חלב קוקוס', 'Coconut milk', 42401010, 'parve', 'other', 'cans'),
  I('bun-ww', 'לחמנייה מקמח מלא', 'Whole wheat bun', 51220019, 'parve', 'grain', 'bakery', { piece: 70, pieceHe: 'לחמנייה', pieceEn: 'bun', swaps: ['pita-ww'] }),
  I('kidney-beans', 'שעועית אדומה (שימורים)', 'Red kidney beans (can)', 41106030, 'parve', 'legume', 'cans', { swaps: ['white-beans-cooked'] }),
  I('lemon', 'לימון', 'Lemon', 61113010, 'parve', 'fruit', 'produce', { piece: 100, pieceHe: 'לימון', pieceEn: 'lemon' }),
  I('sugar', 'סוכר', 'Sugar', 91101010, 'parve', 'sweet', 'dry'),
  I('baking-powder', 'אבקת אפייה', 'Baking powder', 50010149, 'parve', 'other', 'dry'),
  I('yeast', 'שמרים יבשים', 'Dry yeast', 75236000, 'parve', 'other', 'dry'),
  I('mayo-light', 'מיונז לייט', 'Light mayonnaise', 83204029, 'parve', 'sauce', 'cans'),
  I('chicken-broth', 'ציר עוף', 'Chicken stock', 28340110, 'meat', 'sauce', 'cans', { swaps: ['broth'] }),
  // ---- sauces, spices
  I('soy-sauce', 'רוטב סויה מופחת נתרן', 'Soy sauce, reduced sodium', 41420350, 'parve', 'sauce', 'cans'),
  I('mustard', 'חרדל דיז׳ון', 'Dijon mustard', 75506029, 'parve', 'sauce', 'cans'),
  I('vinegar', 'חומץ', 'Vinegar', 64401000, 'parve', 'sauce', 'cans'),
  I('balsamic', 'חומץ בלסמי', 'Balsamic vinegar', 95000300, 'parve', 'sauce', 'cans'),
  I('broth', 'ציר ירקות', 'Vegetable stock', 75657000, 'parve', 'sauce', 'cans'),
  I('salt', 'מלח', 'Salt', 91000000, 'parve', 'spice', 'spices'),
  I('pepper', 'פלפל שחור', 'Black pepper', 95000100, 'parve', 'spice', 'spices'),
  I('paprika', 'פפריקה מתוקה', 'Sweet paprika', 95000090, 'parve', 'spice', 'spices'),
  I('turmeric', 'כורכום', 'Turmeric', 95000120, 'parve', 'spice', 'spices'),
  I('cinnamon', 'קינמון', 'Cinnamon', 95000010, 'parve', 'spice', 'spices'),
  I('zaatar', 'זעתר', "Za'atar", 75365020, 'parve', 'spice', 'spices'),
  I('oregano', 'אורגנו', 'Oregano', 95000270, 'parve', 'spice', 'spices'),
  I('thyme', 'טימין', 'Thyme', 95000260, 'parve', 'spice', 'spices'),
  I('garlic-powder', 'אבקת שום', 'Garlic powder', 75111510, 'parve', 'spice', 'spices'),
  I('onion-powder', 'אבקת בצל', 'Onion powder', 75117060, 'parve', 'spice', 'spices'),
  // Not in the MoH database: USDA FoodData Central (SR Legacy 170923 cumin, 171319 chili powder).
  I('cumin', 'כמון', 'Cumin', 0, 'parve', 'spice', 'spices', { per100: { kcal: 375, protein: 17.8, fat: 22.3, carbs: 33.7, sugars: 2.3, fiber: 10.5, satFat: 1.5, sodium: 168 } }),
  I('chili-flakes', 'צ׳ילי גרוס', 'Chili flakes', 0, 'parve', 'spice', 'spices', { per100: { kcal: 282, protein: 13.5, fat: 14.3, carbs: 15.6, sugars: 7.2, fiber: 34.8, satFat: 2.5, sodium: 2867 } }),
  // A few grams per dish: counted as 0 (no reliable data; < 1% of a dish's calories).
  I('sumac', 'סומק', 'Sumac', 0, 'parve', 'spice', 'spices', { per100: { kcal: 0, protein: 0, fat: 0, carbs: 0 } }),
  I('baharat', 'בהרט', 'Baharat spice mix', 0, 'parve', 'spice', 'spices', { per100: { kcal: 0, protein: 0, fat: 0, carbs: 0 } }),
  I('hawaij', 'חוואייג׳ למרק', 'Hawaij (soup spice)', 0, 'parve', 'spice', 'spices', { per100: { kcal: 0, protein: 0, fat: 0, carbs: 0 } }),
];

export const INGREDIENT = new Map(INGREDIENTS.map((i) => [i.id, i]));
