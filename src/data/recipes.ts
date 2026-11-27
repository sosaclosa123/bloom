// Bloom's own kitchen recipes (owner, Nov 2026): original, written for Bloom,
// kosher (never meat with dairy; fish is never cooked with meat or dairy
// either). Amounts are real home-cooking quantities in grams of the raw /
// as-bought ingredient (ingredients.ts); nutrition is worked out per gram
// from the Israeli MoH database, so it matches the Food tab. Frying oil
// counts only what the food soaks up (about 10-15% of its weight), as
// nutrition tables do. Steps can carry a timer (minutes) for Cook mode.
//
// Lazy-loaded with the Kitchen (not in the main bundle).

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Cuisine = 'israeli' | 'middle-eastern' | 'north-african' | 'mediterranean' | 'italian' | 'asian' | 'mexican' | 'home';
export type Method = 'pan' | 'bake' | 'grill' | 'boil' | 'stew' | 'raw' | 'fry';
/** Picture for the recipe card (Kitchen stickers). */
export type Art = 'pan' | 'pot' | 'bowl' | 'salad' | 'plate' | 'pita' | 'fish' | 'chicken' | 'egg' | 'pasta' | 'sweet' | 'soup' | 'burger' | 'pizza';

export interface Step {
  he: string;
  en: string;
  /** Timer for this step (Cook mode). */
  min?: number;
}

export interface Recipe {
  id: string;
  he: string;
  en: string;
  meal: Meal[];
  cuisine: Cuisine;
  method: Method;
  /** Total time, minutes (hands-on + oven/pot). */
  time: number;
  /** 1 easy, 2 medium, 3 harder. */
  level: 1 | 2 | 3;
  servings: number;
  art: Art;
  /** [ingredient id, grams for all servings] */
  ing: [string, number][];
  steps: Step[];
  /** fried, soup, salad, nocook, onepot, sweet */
  tags?: string[];
  /** Cravings this dish answers (schnitzel, shawarma, burger, pizza, pasta, fries, falafel, sweet, chocolate, sabich). */
  crave?: string[];
}

type M = Omit<Recipe, 'id' | 'he' | 'en' | 'ing' | 'steps'>;
const R = (id: string, he: string, en: string, m: M, ing: [string, number][], steps: [string, string, number?][]): Recipe => ({
  id,
  he,
  en,
  ...m,
  ing,
  steps: steps.map(([h, e, min]) => (min ? { he: h, en: e, min } : { he: h, en: e })),
});

export const RECIPES: Recipe[] = [
  // ================================================================ breakfast
  R('shakshuka', 'שקשוקה', 'Shakshuka', { meal: ['breakfast', 'lunch', 'dinner'], cuisine: 'israeli', method: 'pan', time: 30, level: 1, servings: 2, art: 'pan', tags: ['onepot'] },
    [['olive-oil', 14], ['onion', 150], ['garlic', 10], ['red-pepper', 160], ['tomato', 480], ['tomato-paste', 15], ['paprika', 3], ['cumin', 2], ['salt', 3], ['egg', 220], ['parsley', 10]],
    [
      ['חממו את השמן במחבת רחבה. הוסיפו בצל קצוץ ופלפל ברצועות וטגנו עד שמתרככים.', 'Heat the oil in a wide pan. Add the chopped onion and pepper strips and cook until soft.', 6],
      ['הוסיפו שום קצוץ, פפריקה וכמון וערבבו דקה.', 'Add the chopped garlic, paprika and cumin and stir for a minute.', 1],
      ['הוסיפו עגבניות קצוצות, רסק ומלח. בשלו על אש בינונית עד שהרוטב מסמיך.', 'Add the chopped tomatoes, paste and salt. Simmer on medium heat until the sauce thickens.', 12],
      ['עשו 4 גומות ברוטב ושברו לתוכן את הביצים. כסו ובשלו עד שהחלבון מתקשה והחלמון עדיין רך.', 'Make 4 wells in the sauce and crack the eggs into them. Cover and cook until the whites set and the yolks are still soft.', 6],
      ['פזרו פטרוזיליה והגישו מהמחבת.', 'Sprinkle with parsley and serve from the pan.'],
    ]),
  R('green-shakshuka', 'שקשוקה ירוקה עם פטה', 'Green shakshuka with feta', { meal: ['breakfast', 'lunch'], cuisine: 'israeli', method: 'pan', time: 25, level: 1, servings: 2, art: 'pan', tags: ['onepot'] },
    [['olive-oil', 14], ['spring-onion', 45], ['garlic', 10], ['spinach', 300], ['zucchini', 200], ['salt', 2], ['pepper', 1], ['egg', 220], ['feta', 60], ['dill', 10]],
    [
      ['גררו את הקישוא בפומפייה גסה. חממו שמן במחבת וטגנו בצל ירוק ושום דקה.', 'Coarsely grate the zucchini. Heat the oil and fry the spring onion and garlic for a minute.', 1],
      ['הוסיפו קישוא ותרד, מלח ופלפל. ערבבו עד שהתרד מצטמק והנוזלים מתאדים.', 'Add the zucchini, spinach, salt and pepper. Stir until the spinach wilts and the liquid is gone.', 6],
      ['עשו 4 גומות, שברו לתוכן ביצים, כסו ובשלו.', 'Make 4 wells, crack in the eggs, cover and cook.', 6],
      ['פוררו פטה ופזרו שמיר מעל.', 'Crumble the feta and scatter the dill on top.'],
    ]),
  R('herb-omelette-salad', 'חביתת עשבים וסלט ישראלי', 'Herb omelette with Israeli salad', { meal: ['breakfast', 'dinner'], cuisine: 'israeli', method: 'pan', time: 15, level: 1, servings: 1, art: 'egg' },
    [['egg', 110], ['parsley', 5], ['dill', 5], ['spring-onion', 15], ['olive-oil', 5], ['salt', 2], ['tomato', 120], ['cucumber', 120], ['lemon-juice', 10], ['bread-ww', 60]],
    [
      ['טרפו ביצים עם עשבים קצוצים, בצל ירוק וקורט מלח.', 'Beat the eggs with the chopped herbs, spring onion and a pinch of salt.'],
      ['חממו מחבת עם חצי מהשמן, שפכו את הביצים ובשלו עד שמתייצבות. קפלו לחצי.', 'Heat a pan with half the oil, pour in the eggs and cook until set. Fold in half.', 3],
      ['קצצו עגבנייה ומלפפון לקוביות קטנות, תבלו בלימון, שאר השמן ומלח.', 'Dice the tomato and cucumber small; dress with lemon, the rest of the oil and salt.'],
      ['הגישו עם 2 פרוסות לחם מלא.', 'Serve with 2 slices of whole wheat bread.'],
    ]),
  R('overnight-oats', 'שיבולת שועל של לילה', 'Overnight oats', { meal: ['breakfast'], cuisine: 'home', method: 'raw', time: 5, level: 1, servings: 1, art: 'bowl', tags: ['nocook'] },
    [['oats', 50], ['milk', 120], ['yogurt', 100], ['honey', 7], ['cinnamon', 1], ['blueberries', 70], ['walnuts', 10]],
    [
      ['ערבבו בצנצנת שיבולת שועל, חלב, יוגורט, דבש וקינמון.', 'Stir the oats, milk, yogurt, honey and cinnamon together in a jar.'],
      ['סגרו והכניסו למקרר ללילה (לפחות 4 שעות).', 'Close it and refrigerate overnight (at least 4 hours).'],
      ['בבוקר הוסיפו אוכמניות ואגוזים קצוצים.', 'In the morning top with the blueberries and chopped walnuts.'],
    ]),
  R('protein-pancakes', 'פנקייק חלבון עם בננה', 'Banana protein pancakes', { meal: ['breakfast', 'snack'], cuisine: 'home', method: 'pan', time: 20, level: 1, servings: 2, art: 'sweet', crave: ['sweet'] },
    [['oats', 80], ['egg', 110], ['cottage', 125], ['banana', 120], ['baking-powder', 4], ['cinnamon', 1], ['canola-oil', 5], ['strawberries', 150], ['honey', 14]],
    [
      ['טחנו את שיבולת השועל לקמח. הוסיפו ביצים, קוטג׳, בננה, אבקת אפייה וקינמון וטחנו לבלילה חלקה.', 'Blend the oats into flour. Add the eggs, cottage cheese, banana, baking powder and cinnamon and blend smooth.'],
      ['חממו מחבת משומנת קלות. יצקו כף גדושה לכל פנקייק.', 'Heat a lightly oiled pan. Pour a heaped spoonful per pancake.'],
      ['כשמופיעות בועות הפכו ואפו עוד דקה.', 'Flip when bubbles appear and cook one more minute.', 3],
      ['הגישו עם תותים פרוסים ומעט דבש.', 'Serve with sliced strawberries and a little honey.'],
    ]),
  R('labneh-zaatar-pita', 'פיתה לבנה וזעתר עם ירקות', "Labneh & za'atar pita with vegetables", { meal: ['breakfast', 'dinner'], cuisine: 'israeli', method: 'raw', time: 10, level: 1, servings: 1, art: 'pita', tags: ['nocook'] },
    [['pita-ww', 90], ['labneh', 60], ['zaatar', 4], ['olive-oil', 5], ['tomato', 120], ['cucumber', 120], ['olives', 20]],
    [
      ['חממו את הפיתה בטוסטר או במחבת יבשה.', 'Warm the pita in a toaster or a dry pan.', 2],
      ['מרחו לבנה, פזרו זעתר וטפטפו שמן זית.', "Spread the labneh, sprinkle the za'atar and drizzle the olive oil."],
      ['הגישו עם עגבנייה, מלפפון וזיתים.', 'Serve with tomato, cucumber and olives.'],
    ]),
  R('warm-oatmeal', 'דייסת שיבולת שועל חמה', 'Warm oatmeal with banana', { meal: ['breakfast'], cuisine: 'home', method: 'boil', time: 10, level: 1, servings: 1, art: 'bowl' },
    [['oats', 50], ['milk', 250], ['banana', 120], ['cinnamon', 1], ['walnuts', 15], ['silan', 10]],
    [
      ['הביאו חלב לסף רתיחה, הוסיפו שיבולת שועל ובשלו בערבוב.', 'Bring the milk almost to a boil, add the oats and cook, stirring.', 5],
      ['הוסיפו חצי בננה מעוכה וקינמון.', 'Stir in half the banana, mashed, and the cinnamon.'],
      ['הגישו עם שאר הבננה פרוסה, אגוזים וסילאן.', 'Top with the rest of the banana, sliced, the walnuts and the silan.'],
    ]),
  R('veggie-egg-muffins', 'מאפינס ביצים וירקות', 'Vegetable egg muffins', { meal: ['breakfast', 'snack'], cuisine: 'home', method: 'bake', time: 30, level: 1, servings: 3, art: 'egg' },
    [['egg', 330], ['red-pepper', 80], ['spinach', 60], ['spring-onion', 30], ['mushrooms', 100], ['salt', 3], ['pepper', 1], ['canola-oil', 5]],
    [
      ['חממו תנור ל-180 מעלות ושמנו תבנית ל-12 מאפינס.', 'Heat the oven to 180 °C and oil a 12-cup muffin tin.'],
      ['קצצו דק את הירקות וחלקו בין השקעים.', 'Finely chop the vegetables and divide them between the cups.'],
      ['טרפו ביצים עם מלח ופלפל ויצקו מעל.', 'Beat the eggs with salt and pepper and pour over.'],
      ['אפו עד שהביצים יציבות.', 'Bake until the eggs are set.', 20],
    ]),
  R('yogurt-tahini-bowl', 'קערת יוגורט, תמרים וטחינה', 'Yogurt bowl with dates & tahini', { meal: ['breakfast', 'snack'], cuisine: 'middle-eastern', method: 'raw', time: 5, level: 1, servings: 1, art: 'bowl', tags: ['nocook'], crave: ['sweet'] },
    [['yogurt', 200], ['dates', 24], ['tahini', 15], ['almonds', 10], ['pomegranate', 40]],
    [
      ['שימו יוגורט בקערה.', 'Put the yogurt in a bowl.'],
      ['הוסיפו תמר קצוץ, שקדים קצוצים וגרעיני רימון.', 'Add the chopped date, chopped almonds and pomegranate seeds.'],
      ['טפטפו טחינה גולמית מעל.', 'Drizzle the raw tahini on top.'],
    ]),
  R('sweet-potato-hash', 'מחבת בטטה וביצים', 'Sweet potato & egg hash', { meal: ['breakfast', 'lunch'], cuisine: 'home', method: 'pan', time: 25, level: 1, servings: 2, art: 'pan', tags: ['onepot'] },
    [['sweet-potato', 300], ['onion', 100], ['red-pepper', 160], ['olive-oil', 14], ['paprika', 2], ['salt', 3], ['egg', 220], ['spring-onion', 15]],
    [
      ['קלפו וחתכו את הבטטה לקוביות קטנות (1 ס״מ).', 'Peel and cut the sweet potato into small (1 cm) cubes.'],
      ['טגנו בשמן עם מכסה, בערבוב מדי פעם, עד שמתרככת.', 'Cook in the oil with a lid on, stirring now and then, until soft.', 10],
      ['הוסיפו בצל ופלפל, פפריקה ומלח וטגנו בלי מכסה עד שמזהיב.', 'Add the onion, pepper, paprika and salt and cook uncovered until golden.', 5],
      ['עשו 4 גומות, שברו ביצים, כסו ובשלו. פזרו בצל ירוק.', 'Make 4 wells, crack in the eggs, cover and cook. Scatter the spring onion.', 6],
    ]),
  R('avocado-egg-toast', 'טוסט אבוקדו וביצה', 'Avocado & egg toast', { meal: ['breakfast'], cuisine: 'home', method: 'boil', time: 12, level: 1, servings: 1, art: 'egg' },
    [['bread-ww', 60], ['avocado', 70], ['lemon-juice', 5], ['egg', 55], ['salt', 1], ['chili-flakes', 0.5], ['tomato', 60]],
    [
      ['בשלו ביצה במים רותחים 7 דקות, ואז קררו במים קרים.', 'Boil the egg for 7 minutes, then cool it in cold water.', 7],
      ['קלו את הלחם. מעכו אבוקדו עם לימון ומלח ומרחו.', 'Toast the bread. Mash the avocado with lemon and salt and spread it on.'],
      ['הוסיפו פרוסות עגבנייה וביצה, ופזרו צ׳ילי.', 'Add the tomato slices and the egg, sliced; sprinkle the chili.'],
    ]),
  R('cottage-toast', 'טוסט קוטג׳ וירקות', 'Cottage cheese toast with vegetables', { meal: ['breakfast', 'dinner', 'snack'], cuisine: 'israeli', method: 'raw', time: 5, level: 1, servings: 1, art: 'plate', tags: ['nocook'] },
    [['bread-ww', 60], ['cottage', 125], ['cucumber', 60], ['tomato', 60], ['pepper', 0.5], ['zaatar', 1]],
    [
      ['מרחו קוטג׳ על 2 פרוסות לחם.', 'Spread the cottage cheese on 2 slices of bread.'],
      ['הניחו פרוסות מלפפון ועגבנייה, ופזרו פלפל שחור וזעתר.', "Top with cucumber and tomato slices; sprinkle black pepper and za'atar."],
    ]),

  // ================================================================ chicken & turkey (meat)
  R('oven-schnitzel', 'שניצל בתנור', 'Oven-baked schnitzel', { meal: ['lunch', 'dinner'], cuisine: 'israeli', method: 'bake', time: 35, level: 1, servings: 2, art: 'chicken', crave: ['schnitzel'] },
    [['chicken-breast', 300], ['egg', 55], ['mustard', 10], ['breadcrumbs', 40], ['cornflakes', 20], ['sesame', 8], ['paprika', 2], ['salt', 2], ['canola-oil', 10], ['lemon', 50]],
    [
      ['חממו תנור ל-220 מעלות ורפדו תבנית בנייר אפייה.', 'Heat the oven to 220 °C and line a tray with baking paper.'],
      ['פרסו את החזה לפרוסות דקות (או רדדו בין שני ניילונים).', 'Slice the breast thin (or pound it flat between two sheets of plastic).'],
      ['טרפו ביצה עם חרדל ומלח. ערבבו פירורי לחם, קורנפלקס מרוסק, שומשום ופפריקה.', 'Beat the egg with the mustard and salt. Mix the breadcrumbs, crushed cornflakes, sesame and paprika.'],
      ['טבלו כל פרוסה בביצה ואז בציפוי, הניחו בתבנית ורססו או מרחו בשמן.', 'Dip each slice in the egg, then the coating; lay on the tray and spray or brush with the oil.'],
      ['אפו, הפכו באמצע, עד שזהוב ופריך.', 'Bake until golden and crisp, turning halfway.', 18],
      ['הגישו עם פלחי לימון.', 'Serve with lemon wedges.'],
    ]),
  R('classic-schnitzel', 'שניצל מטוגן קלאסי', 'Classic fried schnitzel', { meal: ['lunch', 'dinner'], cuisine: 'israeli', method: 'fry', time: 30, level: 2, servings: 2, art: 'chicken', tags: ['fried'], crave: ['schnitzel'] },
    // Fried: ~12% of the coated weight in oil is absorbed (counted), not the whole pan.
    [['chicken-breast', 300], ['egg', 55], ['flour', 20], ['breadcrumbs', 60], ['salt', 2], ['pepper', 1], ['canola-oil', 45], ['lemon', 50]],
    [
      ['פרסו את החזה דק ותבלו במלח ופלפל.', 'Slice the breast thin and season with salt and pepper.'],
      ['הכינו שלוש צלחות: קמח, ביצה טרופה ופירורי לחם. העבירו כל פרוסה בשלושתן.', 'Set out three plates: flour, beaten egg, breadcrumbs. Coat each slice in all three.'],
      ['חממו שמן בגובה חצי ס״מ במחבת. טגנו 3 דקות מכל צד עד שזהוב.', 'Heat half a centimetre of oil in a pan. Fry 3 minutes a side until golden.', 6],
      ['העבירו לנייר סופג. הגישו עם לימון.', 'Drain on paper towel. Serve with lemon.'],
    ]),
  R('chicken-shawarma', 'שווארמה פרגיות בתנור', 'Oven chicken shawarma', { meal: ['lunch', 'dinner'], cuisine: 'middle-eastern', method: 'bake', time: 40, level: 1, servings: 2, art: 'pita', crave: ['shawarma'] },
    [['chicken-thigh', 400], ['onion', 150], ['olive-oil', 14], ['cumin', 3], ['turmeric', 2], ['paprika', 3], ['baharat', 3], ['garlic', 10], ['lemon-juice', 15], ['salt', 3], ['pita-ww', 180], ['tahini', 30], ['tomato', 120], ['cucumber', 120]],
    [
      ['חתכו פרגיות לרצועות דקות ובצל לטבעות. ערבבו עם שמן, תבלינים, שום, לימון ומלח.', 'Cut the chicken thighs into thin strips and the onion into rings. Mix with the oil, spices, garlic, lemon and salt.'],
      ['השרו לפחות 15 דקות (אפשר גם לילה במקרר).', 'Marinate at least 15 minutes (or overnight in the fridge).', 15],
      ['פזרו בשכבה אחת בתבנית ואפו ב-230 מעלות עד שהקצוות משחימים.', 'Spread in one layer on a tray and roast at 230 °C until the edges brown.', 20],
      ['דללו טחינה במים ולימון. הגישו בפיתה עם עגבנייה, מלפפון וטחינה.', 'Thin the tahini with water and lemon. Serve in pita with tomato, cucumber and the tahini.'],
    ]),
  R('lemon-herb-chicken', 'חזה עוף בלימון ועשבים עם סלט', 'Lemon-herb grilled chicken & salad', { meal: ['lunch', 'dinner'], cuisine: 'mediterranean', method: 'grill', time: 25, level: 1, servings: 2, art: 'chicken' },
    [['chicken-breast', 320], ['lemon-juice', 30], ['olive-oil', 18], ['garlic', 10], ['thyme', 1], ['salt', 3], ['pepper', 1], ['lettuce', 150], ['tomato', 240], ['cucumber', 120], ['red-pepper', 80]],
    [
      ['ערבבו מחצית מהלימון והשמן עם שום, טימין, מלח ופלפל, והשרו בהם את החזה.', 'Mix half the lemon and oil with the garlic, thyme, salt and pepper and coat the chicken.', 10],
      ['צלו במחבת פסים חמה 5–6 דקות מכל צד, עד שבפנים כבר לא ורוד.', 'Grill in a hot ridged pan 5-6 minutes a side, until no longer pink inside.', 12],
      ['חתכו ירקות לסלט ותבלו בשאר הלימון והשמן.', 'Cut the vegetables for a salad and dress with the remaining lemon and oil.'],
      ['תנו לעוף לנוח 3 דקות, פרסו והגישו על הסלט.', 'Rest the chicken 3 minutes, slice and serve on the salad.', 3],
    ]),
  R('chicken-rice-pot', 'עוף ואורז בסיר אחד', 'One-pot chicken & rice', { meal: ['lunch', 'dinner'], cuisine: 'middle-eastern', method: 'stew', time: 50, level: 2, servings: 4, art: 'pot', tags: ['onepot'] },
    [['chicken-thigh', 600], ['rice', 300], ['onion', 150], ['carrot', 140], ['canola-oil', 20], ['turmeric', 3], ['baharat', 4], ['salt', 4], ['chicken-broth', 600], ['raisins', 30], ['almonds', 20], ['parsley', 10]],
    [
      ['שטפו את האורז עד שהמים צלולים.', 'Rinse the rice until the water runs clear.'],
      ['השחימו את הפרגיות בשמן בסיר רחב משני הצדדים והוציאו.', 'Brown the chicken thighs in the oil in a wide pot on both sides and take them out.', 8],
      ['טגנו בצל וגזר מגורד, הוסיפו תבלינים ואורז וערבבו דקה.', 'Fry the onion and grated carrot, add the spices and rice and stir for a minute.', 6],
      ['הוסיפו ציר ומלח, החזירו את העוף, הביאו לרתיחה, כסו ובשלו על אש נמוכה.', 'Add the stock and salt, return the chicken, bring to a boil, cover and cook on low.', 25],
      ['כבו, השאירו מכוסה 10 דקות. פזרו צימוקים, שקדים ופטרוזיליה.', 'Turn off and leave covered 10 minutes. Scatter the raisins, almonds and parsley.', 10],
    ]),
  R('chicken-stir-fry', 'מוקפץ עוף וירקות', 'Chicken & vegetable stir-fry', { meal: ['lunch', 'dinner'], cuisine: 'asian', method: 'pan', time: 25, level: 1, servings: 2, art: 'bowl' },
    [['chicken-breast', 300], ['broccoli', 200], ['red-pepper', 160], ['carrot', 70], ['spring-onion', 30], ['garlic', 10], ['ginger', 10], ['soy-sauce', 30], ['honey', 10], ['canola-oil', 14], ['sesame', 5], ['rice', 120]],
    [
      ['בשלו את האורז לפי ההוראות על האריזה.', 'Cook the rice as the package says.', 15],
      ['חתכו את העוף לרצועות והירקות לחתיכות קטנות ושוות.', 'Cut the chicken into strips and the vegetables into small, even pieces.'],
      ['הקפיצו את העוף בשמן חם מאוד עד שמשחים, והוציאו.', 'Stir-fry the chicken in very hot oil until browned; take it out.', 4],
      ['הקפיצו ירקות, שום וג׳ינג׳ר, החזירו את העוף, הוסיפו סויה ודבש וערבבו עד שהרוטב מבריק.', 'Stir-fry the vegetables, garlic and ginger, return the chicken, add the soy and honey and toss until glossy.', 5],
      ['פזרו שומשום ובצל ירוק והגישו עם האורז.', 'Sprinkle sesame and spring onion; serve with the rice.'],
    ]),
  R('chicken-soup', 'מרק עוף של בית', 'Home chicken soup', { meal: ['lunch', 'dinner'], cuisine: 'home', method: 'stew', time: 90, level: 1, servings: 6, art: 'soup', tags: ['soup', 'onepot'] },
    [['chicken-thigh', 700], ['onion', 150], ['carrot', 280], ['celery', 120], ['zucchini', 200], ['pumpkin', 250], ['potato', 180], ['parsley', 15], ['dill', 15], ['salt', 10], ['pepper', 1], ['turmeric', 1]],
    [
      ['שימו את העוף בסיר גדול עם 2.5 ליטר מים והביאו לרתיחה. הסירו קצף.', 'Put the chicken in a large pot with 2.5 litres of water and bring to a boil. Skim off the foam.', 10],
      ['הוסיפו את כל הירקות חתוכים לחתיכות גדולות, מלח, פלפל וכורכום.', 'Add all the vegetables in large pieces, the salt, pepper and turmeric.'],
      ['בשלו מכוסה חלקית על אש נמוכה.', 'Simmer partly covered on low heat.', 70],
      ['ב-10 הדקות האחרונות הוסיפו פטרוזיליה ושמיר קשורים.', 'Add the tied parsley and dill for the last 10 minutes.', 10],
    ]),
  R('turkey-meatballs', 'קציצות הודו ברוטב עגבניות', 'Turkey meatballs in tomato sauce', { meal: ['lunch', 'dinner'], cuisine: 'home', method: 'stew', time: 45, level: 2, servings: 4, art: 'pot' },
    [['chicken-ground', 500], ['onion', 150], ['breadcrumbs', 30], ['egg', 55], ['parsley', 15], ['salt', 6], ['pepper', 1], ['olive-oil', 14], ['garlic', 10], ['crushed-tomatoes', 800], ['paprika', 3], ['sugar', 4]],
    [
      ['ערבבו טחון עם חצי מהבצל מגורד, פירורי לחם, ביצה, פטרוזיליה, חצי מהמלח ופלפל. צרו כ-16 קציצות.', 'Mix the ground meat with half the onion, grated, the breadcrumbs, egg, parsley, half the salt and pepper. Shape about 16 balls.'],
      ['בסיר רחב טגנו בשמן את שאר הבצל ושום. הוסיפו עגבניות מרוסקות, פפריקה, סוכר ושאר המלח והביאו לרתיחה.', 'In a wide pot fry the rest of the onion and the garlic in the oil. Add the crushed tomatoes, paprika, sugar and remaining salt; bring to a boil.', 8],
      ['הכניסו את הקציצות לרוטב בזהירות, כסו ובשלו על אש נמוכה.', 'Gently lower the meatballs into the sauce, cover and simmer.', 30],
    ]),
  R('kebab-plate', 'קבב על האש עם סלט וטחינה', 'Grilled kebab with salad & tahini', { meal: ['lunch', 'dinner'], cuisine: 'middle-eastern', method: 'grill', time: 30, level: 2, servings: 3, art: 'plate', crave: ['burger'] },
    [['beef-ground', 450], ['onion', 100], ['parsley', 20], ['baharat', 4], ['cumin', 2], ['salt', 5], ['pepper', 1], ['tahini', 45], ['lemon-juice', 20], ['tomato', 240], ['cucumber', 240], ['pita-ww', 270]],
    [
      ['גררו את הבצל וסחטו את הנוזלים. ערבבו עם הבשר, פטרוזיליה קצוצה, תבלינים ומלח.', 'Grate the onion and squeeze out the liquid. Mix with the meat, chopped parsley, spices and salt.'],
      ['צרו קבבים מוארכים בעובי אגודל.', 'Shape thumb-thick long kebabs.'],
      ['צלו על גריל או מחבת פסים חמה, 4 דקות מכל צד.', 'Grill on a barbecue or a hot ridged pan, 4 minutes a side.', 8],
      ['דללו טחינה במים, לימון ומלח. הגישו עם סלט קצוץ ופיתה.', 'Thin the tahini with water, lemon and salt. Serve with chopped salad and pita.'],
    ]),
  R('lean-burger', 'המבורגר ביתי', 'Homemade burger', { meal: ['lunch', 'dinner'], cuisine: 'home', method: 'grill', time: 25, level: 1, servings: 2, art: 'burger', crave: ['burger'] },
    [['beef-ground', 280], ['onion', 50], ['salt', 3], ['pepper', 1], ['bun-ww', 140], ['lettuce', 40], ['tomato', 120], ['mustard', 10], ['mayo-light', 15], ['cucumber', 60]],
    [
      ['ערבבו בעדינות בשר, בצל מגורד, מלח ופלפל וצרו 2 קציצות שטוחות עם גומה קטנה במרכז.', 'Gently mix the meat, grated onion, salt and pepper; shape 2 flat patties with a small dip in the middle.'],
      ['צלו במחבת חמה מאוד 4 דקות מכל צד (ליותר עשוי – עוד 2).', 'Cook in a very hot pan 4 minutes a side (2 more for well done).', 8],
      ['קלו את הלחמניות קלות. מרחו חרדל ומיונז והרכיבו עם חסה, עגבנייה ומלפפון.', 'Lightly toast the buns. Spread the mustard and mayo and build with lettuce, tomato and cucumber.'],
    ]),
  R('chili-con-carne', 'צ׳ילי בשר ושעועית', 'Beef & bean chili', { meal: ['lunch', 'dinner'], cuisine: 'mexican', method: 'stew', time: 50, level: 1, servings: 4, art: 'pot', tags: ['onepot'] },
    [['beef-ground', 500], ['onion', 150], ['red-pepper', 160], ['garlic', 15], ['olive-oil', 14], ['cumin', 4], ['paprika', 4], ['chili-flakes', 2], ['crushed-tomatoes', 800], ['kidney-beans', 400], ['corn', 150], ['salt', 6], ['rice', 240]],
    [
      ['טגנו בצל, פלפל ושום בשמן עד שמתרככים.', 'Fry the onion, pepper and garlic in the oil until soft.', 6],
      ['הוסיפו את הבשר ופוררו במזלג עד שמשחים.', 'Add the beef and break it up with a fork until browned.', 6],
      ['הוסיפו תבלינים, עגבניות, שעועית מסוננת, תירס ומלח. בשלו על אש נמוכה.', 'Add the spices, tomatoes, drained beans, corn and salt. Simmer on low.', 30],
      ['בינתיים בשלו את האורז והגישו יחד.', 'Meanwhile cook the rice and serve together.', 15],
    ]),
  R('bolognese', 'ספגטי בולונז', 'Spaghetti bolognese', { meal: ['lunch', 'dinner'], cuisine: 'italian', method: 'stew', time: 45, level: 1, servings: 4, art: 'pasta', crave: ['pasta'] },
    [['pasta', 320], ['beef-ground', 400], ['onion', 150], ['carrot', 70], ['celery', 60], ['garlic', 10], ['olive-oil', 14], ['crushed-tomatoes', 800], ['tomato-paste', 30], ['oregano', 2], ['basil', 10], ['salt', 7], ['pepper', 1]],
    [
      ['קצצו דק בצל, גזר וסלרי וטגנו בשמן עד שמתרככים.', 'Finely chop the onion, carrot and celery and soften them in the oil.', 8],
      ['הוסיפו שום ובשר ופוררו עד שמשחים.', 'Add the garlic and beef and break it up until browned.', 6],
      ['הוסיפו רסק, עגבניות מרוסקות, אורגנו, מלח ופלפל. בשלו על אש נמוכה.', 'Add the paste, crushed tomatoes, oregano, salt and pepper. Simmer on low.', 25],
      ['בשלו את הפסטה במים רותחים ומומלחים לפי האריזה, סננו וערבבו עם הרוטב ובזיליקום.', 'Boil the pasta in salted water as the package says, drain and toss with the sauce and basil.', 10],
    ]),
  R('stuffed-peppers', 'פלפלים ממולאים בשר ואורז', 'Peppers stuffed with beef & rice', { meal: ['lunch', 'dinner'], cuisine: 'home', method: 'bake', time: 75, level: 2, servings: 4, art: 'pot' },
    [['red-pepper', 640], ['beef-ground', 350], ['rice', 120], ['onion', 150], ['parsley', 15], ['baharat', 3], ['salt', 6], ['pepper', 1], ['olive-oil', 14], ['crushed-tomatoes', 400], ['sugar', 4], ['lemon-juice', 15]],
    [
      ['חתכו כובע לפלפלים והוציאו את הגרעינים.', 'Cut the tops off the peppers and remove the seeds.'],
      ['ערבבו בשר, אורז שטוף, חצי מהבצל קצוץ, פטרוזיליה, תבלינים ומלח. מלאו את הפלפלים עד ¾.', 'Mix the beef, rinsed rice, half the onion (chopped), parsley, spices and salt. Fill the peppers ¾ full.'],
      ['טגנו את שאר הבצל בשמן בסיר, הוסיפו עגבניות, סוכר, לימון וכוס מים.', 'Fry the rest of the onion in the oil in a pot; add the tomatoes, sugar, lemon and a cup of water.', 5],
      ['העמידו את הפלפלים ברוטב, החזירו כובעים, כסו ובשלו על אש נמוכה.', 'Stand the peppers in the sauce, put the tops back, cover and simmer.', 60],
    ]),
  R('sheet-pan-chicken', 'פרגיות ותפוחי אדמה בתבנית', 'Sheet-pan chicken thighs & potatoes', { meal: ['lunch', 'dinner'], cuisine: 'home', method: 'bake', time: 55, level: 1, servings: 3, art: 'chicken', tags: ['onepot'] },
    [['chicken-thigh', 500], ['potato', 540], ['onion', 150], ['carrot', 140], ['olive-oil', 27], ['paprika', 4], ['garlic-powder', 3], ['thyme', 1], ['salt', 6], ['pepper', 1]],
    [
      ['חממו תנור ל-200 מעלות. חתכו תפוחי אדמה ובצל לפלחים וגזר למקלות.', 'Heat the oven to 200 °C. Cut the potatoes and onion into wedges and the carrots into sticks.'],
      ['ערבבו בתבנית את הירקות והעוף עם שמן, תבלינים ומלח. הניחו את העוף מעל.', 'Toss the vegetables and chicken on a tray with the oil, spices and salt. Put the chicken on top.'],
      ['אפו בלי כיסוי, ערבבו את הירקות פעם אחת באמצע.', 'Roast uncovered, stirring the vegetables once halfway.', 45],
    ]),
  R('turkey-mushroom', 'סטייק הודו עם פטריות', 'Turkey steaks with mushrooms', { meal: ['lunch', 'dinner'], cuisine: 'home', method: 'pan', time: 25, level: 1, servings: 2, art: 'plate' },
    [['turkey-breast', 320], ['mushrooms', 250], ['onion', 100], ['garlic', 10], ['olive-oil', 14], ['thyme', 1], ['soy-sauce', 15], ['salt', 2], ['pepper', 1], ['green-beans', 250]],
    [
      ['תבלו את ההודו במלח ופלפל וצלו במחבת חמה עם חצי מהשמן, 4 דקות מכל צד. הוציאו.', 'Season the turkey with salt and pepper and sear in a hot pan with half the oil, 4 minutes a side. Take it out.', 8],
      ['באותה מחבת טגנו בצל, שום ופטריות פרוסות בשאר השמן עד שמשחימים.', 'In the same pan fry the onion, garlic and sliced mushrooms in the rest of the oil until browned.', 6],
      ['הוסיפו סויה, טימין ו-3 כפות מים, החזירו את ההודו לדקה.', 'Add the soy, thyme and 3 tablespoons of water; return the turkey for a minute.', 1],
      ['אדו או בשלו שעועית ירוקה והגישו לצד.', 'Steam or boil the green beans and serve alongside.', 6],
    ]),
  R('chicken-fajitas', 'פאחיטס עוף', 'Chicken fajitas', { meal: ['lunch', 'dinner'], cuisine: 'mexican', method: 'pan', time: 25, level: 1, servings: 2, art: 'pita' },
    [['chicken-breast', 300], ['red-pepper', 160], ['yellow-pepper', 160], ['onion', 150], ['canola-oil', 14], ['cumin', 2], ['paprika', 3], ['garlic-powder', 2], ['salt', 3], ['lemon-juice', 15], ['tortilla-ww', 240], ['avocado', 70], ['cilantro', 10]],
    [
      ['חתכו עוף, פלפלים ובצל לרצועות. ערבבו את העוף עם התבלינים, מלח ולימון.', 'Cut the chicken, peppers and onion into strips. Toss the chicken with the spices, salt and lemon.'],
      ['הקפיצו את העוף בשמן חם עד שמוכן, והוציאו.', 'Stir-fry the chicken in hot oil until cooked; take it out.', 5],
      ['הקפיצו את הירקות עד שמתרככים אבל עדיין פריכים, והחזירו את העוף.', 'Stir-fry the vegetables until just soft, then return the chicken.', 5],
      ['חממו טורטיות והגישו עם אבוקדו פרוס וכוסברה.', 'Warm the tortillas and serve with sliced avocado and cilantro.'],
    ]),
  R('steak-veg', 'סינטה עם ירקות צלויים', 'Sirloin steak with roasted vegetables', { meal: ['dinner'], cuisine: 'home', method: 'grill', time: 40, level: 2, servings: 2, art: 'plate' },
    [['beef-sirloin', 350], ['zucchini', 200], ['red-pepper', 160], ['eggplant', 200], ['onion', 100], ['olive-oil', 20], ['salt', 4], ['pepper', 1], ['thyme', 1], ['garlic', 10]],
    [
      ['חממו תנור ל-220 מעלות. חתכו את הירקות לחתיכות, ערבבו עם רוב השמן, מלח ושום וצלו.', 'Heat the oven to 220 °C. Cut the vegetables into pieces, toss with most of the oil, salt and garlic and roast.', 25],
      ['הוציאו את הסטייק מהמקרר 20 דקות לפני. ייבשו, תבלו במלח ופלפל.', 'Take the steak out of the fridge 20 minutes before. Pat dry, season with salt and pepper.'],
      ['צלו במחבת חמה מאוד עם מעט שמן, 3–4 דקות מכל צד (מדיום).', 'Sear in a very hot pan with a little oil, 3-4 minutes a side (medium).', 7],
      ['תנו לנוח 5 דקות, פרסו נגד הסיבים והגישו עם הירקות.', 'Rest 5 minutes, slice across the grain and serve with the vegetables.', 5],
    ]),
  R('chicken-tomato-stew', 'עוף ברוטב עגבניות ופלפלים', 'Chicken in tomato & pepper sauce', { meal: ['lunch', 'dinner'], cuisine: 'north-african', method: 'stew', time: 50, level: 1, servings: 4, art: 'pot', tags: ['onepot'] },
    [['chicken-thigh', 600], ['onion', 150], ['red-pepper', 320], ['garlic', 15], ['olive-oil', 14], ['paprika', 5], ['cumin', 2], ['chili', 10], ['crushed-tomatoes', 400], ['salt', 6], ['cilantro', 15], ['couscous-ww', 240]],
    [
      ['השחימו את העוף בשמן בסיר רחב והוציאו.', 'Brown the chicken in the oil in a wide pot and take it out.', 8],
      ['טגנו בצל, פלפלים ושום. הוסיפו פפריקה, כמון וצ׳ילי.', 'Fry the onion, peppers and garlic. Add the paprika, cumin and chili.', 6],
      ['הוסיפו עגבניות ומלח, החזירו את העוף, כסו ובשלו.', 'Add the tomatoes and salt, return the chicken, cover and simmer.', 30],
      ['הכינו קוסקוס לפי האריזה (מים רותחים, 5 דקות מכוסה). פזרו כוסברה והגישו.', 'Make the couscous as the package says (boiling water, 5 minutes covered). Scatter the cilantro and serve.', 5],
    ]),
  R('moroccan-chicken-chickpeas', 'עוף מרוקאי עם חומוס וגזר', 'Moroccan chicken with chickpeas & carrots', { meal: ['lunch', 'dinner'], cuisine: 'north-african', method: 'stew', time: 60, level: 2, servings: 4, art: 'pot', tags: ['onepot'] },
    [['chicken-thigh', 600], ['onion', 150], ['carrot', 280], ['chickpeas-cooked', 300], ['garlic', 10], ['olive-oil', 14], ['turmeric', 3], ['cumin', 3], ['cinnamon', 1], ['paprika', 3], ['chicken-broth', 400], ['lemon', 100], ['salt', 4], ['cilantro', 15]],
    [
      ['השחימו את העוף בשמן בסיר והוציאו.', 'Brown the chicken in the oil in a pot and take it out.', 8],
      ['טגנו בצל ושום, הוסיפו את כל התבלינים לדקה.', 'Fry the onion and garlic; add all the spices for a minute.', 6],
      ['הוסיפו גזר בפרוסות עבות, חומוס, ציר, לימון פרוס ומלח. החזירו את העוף.', 'Add the carrots in thick slices, chickpeas, stock, sliced lemon and salt. Return the chicken.'],
      ['כסו ובשלו על אש נמוכה עד שהעוף רך. פזרו כוסברה.', 'Cover and simmer until the chicken is tender. Scatter the cilantro.', 40],
    ]),
  R('chicken-quinoa-bowl', 'קערת קינואה ועוף', 'Chicken quinoa bowl', { meal: ['lunch'], cuisine: 'mediterranean', method: 'grill', time: 30, level: 1, servings: 2, art: 'bowl' },
    [['quinoa', 120], ['chicken-breast', 250], ['olive-oil', 18], ['paprika', 2], ['salt', 3], ['cucumber', 120], ['tomato', 120], ['red-cabbage', 100], ['chickpeas-cooked', 100], ['parsley', 10], ['lemon-juice', 20], ['tahini', 20]],
    [
      ['שטפו קינואה ובשלו ב-240 מ״ל מים מכוסה, ואז השאירו לנוח.', 'Rinse the quinoa and cook it covered in 240 ml water, then let it rest.', 15],
      ['תבלו את העוף בפפריקה, מלח ומעט שמן וצלו במחבת 5 דקות מכל צד.', 'Season the chicken with paprika, salt and a little oil and grill 5 minutes a side.', 10],
      ['חתכו ירקות, וסדרו בקערות עם קינואה, חומוס ועוף פרוס.', 'Cut the vegetables and arrange in bowls with the quinoa, chickpeas and sliced chicken.'],
      ['ערבבו טחינה, לימון, שאר השמן ומעט מים ויצקו מעל.', 'Whisk the tahini, lemon, remaining oil and a little water and pour over.'],
    ]),
  R('kofta-bulgur', 'קופתה בשר עם בורגול', 'Beef kofta with bulgur', { meal: ['lunch', 'dinner'], cuisine: 'middle-eastern', method: 'bake', time: 40, level: 2, servings: 4, art: 'plate' },
    [['beef-ground', 500], ['onion', 100], ['parsley', 20], ['mint', 5], ['cumin', 3], ['cinnamon', 1], ['salt', 6], ['tomato', 360], ['olive-oil', 14], ['bulgur', 200], ['broth', 400], ['pine-nuts', 15]],
    [
      ['ערבבו בשר, בצל מגורד, פטרוזיליה, נענע, תבלינים וחצי מהמלח. צרו אצבעות קופתה.', 'Mix the meat, grated onion, parsley, mint, spices and half the salt. Shape kofta fingers.'],
      ['סדרו בתבנית על פרוסות עגבנייה, טפטפו שמן ואפו ב-200 מעלות.', 'Lay them on tomato slices in a dish, drizzle oil and bake at 200 °C.', 25],
      ['הביאו ציר לרתיחה עם שאר המלח, הוסיפו בורגול, כסו ובשלו על אש נמוכה.', 'Bring the stock to a boil with the rest of the salt, add the bulgur, cover and cook on low.', 12],
      ['קלו צנוברים במחבת יבשה ופזרו מעל.', 'Toast the pine nuts in a dry pan and scatter over.', 2],
    ]),

  // ================================================================ fish (parve)
  R('baked-salmon', 'סלמון בתנור עם בטטה', 'Baked salmon with sweet potato', { meal: ['lunch', 'dinner'], cuisine: 'mediterranean', method: 'bake', time: 40, level: 1, servings: 2, art: 'fish' },
    [['salmon', 300], ['sweet-potato', 400], ['olive-oil', 18], ['lemon', 100], ['dill', 10], ['garlic', 5], ['salt', 4], ['pepper', 1], ['broccoli', 250]],
    [
      ['חממו תנור ל-200 מעלות. חתכו בטטה לפלחים, ערבבו עם חצי מהשמן ומלח ואפו.', 'Heat the oven to 200 °C. Cut the sweet potato into wedges, toss with half the oil and salt and bake.', 15],
      ['הניחו את הסלמון באותה תבנית עם ברוקולי. תבלו בשום, שמיר, פרוסות לימון, מלח, פלפל ושאר השמן.', 'Add the salmon and broccoli to the tray. Season with garlic, dill, lemon slices, salt, pepper and the rest of the oil.'],
      ['אפו עד שהדג מתפרק בקלות.', 'Bake until the fish flakes easily.', 14],
    ]),
  R('chraime', 'חריימה', 'Chraime (spicy fish in tomato sauce)', { meal: ['lunch', 'dinner'], cuisine: 'north-african', method: 'stew', time: 35, level: 2, servings: 3, art: 'fish' },
    [['tilapia', 450], ['red-pepper', 160], ['garlic', 20], ['olive-oil', 27], ['paprika', 6], ['cumin', 2], ['chili', 10], ['tomato-paste', 30], ['tomato', 240], ['lemon-juice', 15], ['salt', 4], ['cilantro', 15]],
    [
      ['במחבת רחבה טגנו פלפל ברצועות ושום פרוס בשמן.', 'In a wide pan fry the pepper strips and sliced garlic in the oil.', 4],
      ['הוסיפו פפריקה, כמון, צ׳ילי ורסק וערבבו דקה. הוסיפו עגבנייה קצוצה, חצי כוס מים, לימון ומלח.', 'Add the paprika, cumin, chili and paste and stir a minute. Add the chopped tomato, half a cup of water, lemon and salt.', 8],
      ['הניחו את הדג ברוטב, כסו ובשלו על אש נמוכה, וזלפו רוטב מעליו מדי פעם.', 'Lay the fish in the sauce, cover and simmer, spooning sauce over it now and then.', 12],
      ['פזרו כוסברה. מגישים עם לחם או אורז.', 'Scatter the cilantro. Serve with bread or rice.'],
    ]),
  R('fish-tahini-bake', 'דג בטחינה ועגבניות (סינייה)', 'Fish baked in tahini (siniya)', { meal: ['lunch', 'dinner'], cuisine: 'middle-eastern', method: 'bake', time: 35, level: 1, servings: 3, art: 'fish' },
    [['cod', 450], ['onion', 150], ['tomato', 240], ['olive-oil', 14], ['tahini', 60], ['lemon-juice', 25], ['garlic', 5], ['salt', 4], ['pine-nuts', 15], ['parsley', 10]],
    [
      ['חממו תנור ל-200 מעלות. טגנו בצל בשמן עד שזהוב ופזרו בתבנית.', 'Heat the oven to 200 °C. Fry the onion in the oil until golden and spread it in a dish.', 8],
      ['הניחו את הדג מעל, ועליו פרוסות עגבנייה. תבלו במלח.', 'Lay the fish on top, then the tomato slices. Season with salt.'],
      ['ערבבו טחינה, לימון, שום וכ-80 מ״ל מים ויצקו מעל. פזרו צנוברים.', 'Whisk the tahini, lemon, garlic and about 80 ml water and pour over. Scatter the pine nuts.'],
      ['אפו עד שהטחינה מזהיבה בשוליים. פזרו פטרוזיליה.', 'Bake until the tahini is golden at the edges. Scatter the parsley.', 18],
    ]),
  R('tuna-patties', 'לביבות טונה', 'Tuna patties with salad', { meal: ['lunch', 'dinner'], cuisine: 'home', method: 'pan', time: 25, level: 1, servings: 2, art: 'fish' },
    [['tuna-can', 240], ['egg', 55], ['oats', 30], ['spring-onion', 30], ['parsley', 10], ['lemon-juice', 10], ['salt', 1], ['pepper', 1], ['canola-oil', 14], ['lettuce', 100], ['tomato', 120], ['cucumber', 120]],
    [
      ['סננו היטב את הטונה וערבבו עם ביצה, שיבולת שועל, בצל ירוק, פטרוזיליה, לימון ופלפל.', 'Drain the tuna well and mix with the egg, oats, spring onion, parsley, lemon and pepper.'],
      ['צרו 6 לביבות ותנו להן לנוח 5 דקות.', 'Shape 6 patties and let them rest 5 minutes.', 5],
      ['טגנו במעט שמן 3 דקות מכל צד.', 'Fry in a little oil, 3 minutes a side.', 6],
      ['הגישו עם סלט ירוק.', 'Serve with a green salad.'],
    ]),
  R('whole-sea-bream', 'דניס שלם בתנור עם עשבים', 'Whole sea bream with herbs', { meal: ['dinner'], cuisine: 'mediterranean', method: 'bake', time: 35, level: 2, servings: 2, art: 'fish' },
    [['sea-bream', 500], ['lemon', 100], ['garlic', 10], ['parsley', 10], ['thyme', 1], ['olive-oil', 18], ['salt', 4], ['potato', 360]],
    [
      ['חממו תנור ל-220 מעלות. חתכו תפוחי אדמה לפרוסות דקות, ערבבו עם חצי מהשמן ומלח ואפו.', 'Heat the oven to 220 °C. Slice the potatoes thin, toss with half the oil and salt and bake.', 10],
      ['עשו 3 חריצים בכל צד של הדג. מלאו את הבטן בלימון, שום ועשבים.', 'Make 3 cuts on each side of the fish. Fill the belly with lemon, garlic and herbs.'],
      ['הניחו את הדג על תפוחי האדמה, מרחו בשאר השמן ומלח ואפו.', 'Lay the fish on the potatoes, rub with the rest of the oil and salt, and bake.', 20],
    ]),
  R('salmon-rice-bowl', 'קערת אורז וסלמון בסויה ודבש', 'Soy-honey salmon rice bowl', { meal: ['lunch', 'dinner'], cuisine: 'asian', method: 'pan', time: 30, level: 1, servings: 2, art: 'bowl' },
    [['salmon', 260], ['soy-sauce', 30], ['honey', 14], ['ginger', 5], ['garlic', 5], ['rice', 140], ['cucumber', 120], ['carrot', 70], ['avocado', 70], ['sesame', 5], ['spring-onion', 15], ['canola-oil', 5]],
    [
      ['בשלו את האורז לפי האריזה.', 'Cook the rice as the package says.', 15],
      ['ערבבו סויה, דבש, ג׳ינג׳ר ושום מגוררים.', 'Mix the soy, honey and grated ginger and garlic.'],
      ['צלו את הסלמון במחבת משומנת 3 דקות מכל צד, הוסיפו את הרוטב ובשלו עד שמבריק.', 'Sear the salmon in an oiled pan 3 minutes a side, add the sauce and cook until glossy.', 7],
      ['סדרו בקערות אורז, סלמון, מלפפון, גזר מגורד ואבוקדו. פזרו שומשום ובצל ירוק.', 'Fill bowls with rice, salmon, cucumber, grated carrot and avocado. Sprinkle sesame and spring onion.'],
    ]),
  R('fish-peas-tomato', 'דג לבן עם אפונה ועגבניות', 'White fish with peas & tomatoes', { meal: ['lunch', 'dinner'], cuisine: 'mediterranean', method: 'stew', time: 30, level: 1, servings: 3, art: 'fish', tags: ['onepot'] },
    [['cod', 450], ['peas', 200], ['crushed-tomatoes', 400], ['onion', 100], ['garlic', 10], ['olive-oil', 14], ['paprika', 2], ['salt', 4], ['dill', 10], ['rice', 180]],
    [
      ['טגנו בצל ושום בשמן, הוסיפו עגבניות מרוסקות, פפריקה ומלח ובשלו.', 'Fry the onion and garlic in the oil; add the crushed tomatoes, paprika and salt and simmer.', 8],
      ['הוסיפו אפונה ואת הדג בחתיכות, כסו ובשלו עד שהדג לבן לגמרי.', 'Add the peas and the fish in pieces, cover and cook until the fish is white through.', 10],
      ['בשלו את האורז לפי האריזה. פזרו שמיר והגישו.', 'Cook the rice as the package says. Scatter the dill and serve.', 15],
    ]),
  R('tuna-pasta-salad', 'סלט פסטה וטונה', 'Tuna pasta salad', { meal: ['lunch'], cuisine: 'mediterranean', method: 'boil', time: 20, level: 1, servings: 2, art: 'pasta', crave: ['pasta'] },
    [['pasta-ww', 140], ['tuna-can', 160], ['corn', 100], ['red-pepper', 80], ['cucumber', 120], ['olives', 30], ['olive-oil', 14], ['lemon-juice', 20], ['mustard', 5], ['salt', 2], ['parsley', 10]],
    [
      ['בשלו את הפסטה לפי האריזה, סננו ושטפו במים קרים.', 'Cook the pasta as the package says, drain and rinse in cold water.', 11],
      ['ערבבו שמן, לימון, חרדל ומלח לרוטב.', 'Whisk the oil, lemon, mustard and salt into a dressing.'],
      ['ערבבו פסטה, טונה מסוננת, תירס, פלפל ומלפפון קצוצים, זיתים ופטרוזיליה עם הרוטב.', 'Toss the pasta, drained tuna, corn, chopped pepper and cucumber, olives and parsley with the dressing.'],
    ]),

  // ================================================================ vegetarian (parve / dairy)
  R('majadra', 'מג׳דרה', 'Majadra (lentils & rice)', { meal: ['lunch', 'dinner'], cuisine: 'middle-eastern', method: 'stew', time: 50, level: 1, servings: 4, art: 'pot', tags: ['onepot'] },
    [['lentils', 200], ['rice', 200], ['onion', 450], ['olive-oil', 36], ['cumin', 3], ['salt', 6], ['pepper', 1]],
    [
      ['בשלו עדשים במים 15 דקות וסננו.', 'Boil the lentils in water for 15 minutes and drain.', 15],
      ['פרסו את הבצל לטבעות דקות וטגנו בשמן על אש בינונית עד שחום ומתקתק.', 'Slice the onions thin and fry in the oil on medium heat until deep brown and sweet.', 20],
      ['הוציאו חצי מהבצל. לשאר הוסיפו אורז, עדשים, כמון, מלח ו-600 מ״ל מים, הביאו לרתיחה, כסו ובשלו על אש נמוכה.', 'Take out half the onions. To the rest add the rice, lentils, cumin, salt and 600 ml water; bring to a boil, cover and cook on low.', 20],
      ['הגישו עם הבצל השמור מעל. טוב עם סלט.', 'Serve with the saved onions on top. Good with a salad.'],
    ]),
  R('pasta-pomodoro-mozzarella', 'פסטה עגבניות ומוצרלה', 'Tomato pasta with mozzarella', { meal: ['lunch', 'dinner'], cuisine: 'italian', method: 'boil', time: 25, level: 1, servings: 2, art: 'pasta', crave: ['pasta'] },
    [['pasta', 180], ['olive-oil', 14], ['garlic', 10], ['crushed-tomatoes', 400], ['basil', 10], ['salt', 4], ['mozzarella', 60], ['parmesan', 10]],
    [
      ['שימו סיר מים גדול עם מלח על האש לפסטה.', 'Put a big pot of salted water on for the pasta.'],
      ['חממו שמן עם שום פרוס עד שמזהיב, הוסיפו עגבניות ומלח ובשלו.', 'Warm the oil with the sliced garlic until golden; add the tomatoes and salt and simmer.', 12],
      ['בשלו את הפסטה לפי האריזה, סננו ושמרו מעט ממי הבישול.', 'Cook the pasta as the package says; drain, keeping a little of the water.', 10],
      ['ערבבו פסטה, רוטב ובזיליקום. הוסיפו מוצרלה קרועה ופרמזן.', 'Toss the pasta with the sauce and basil. Add the torn mozzarella and parmesan.'],
    ]),
  R('veg-quiche', 'פשטידת ירקות בלי בצק', 'Crustless vegetable quiche', { meal: ['breakfast', 'lunch', 'dinner'], cuisine: 'home', method: 'bake', time: 50, level: 1, servings: 4, art: 'egg' },
    [['egg', 220], ['white-cheese', 250], ['yellow-cheese', 60], ['spinach', 200], ['zucchini', 200], ['onion', 100], ['flour-ww', 30], ['salt', 3], ['pepper', 1], ['canola-oil', 5]],
    [
      ['חממו תנור ל-180 מעלות ושמנו תבנית בקוטר 24 ס״מ.', 'Heat the oven to 180 °C and oil a 24 cm dish.'],
      ['קצצו בצל ותרד וגררו קישוא, וסחטו את הנוזלים.', 'Chop the onion and spinach and grate the zucchini; squeeze out the liquid.'],
      ['ערבבו ביצים, גבינה לבנה, קמח, מלח ופלפל, הוסיפו את הירקות ושפכו לתבנית. פזרו גבינה צהובה.', 'Mix the eggs, white cheese, flour, salt and pepper; add the vegetables and pour into the dish. Sprinkle the yellow cheese.'],
      ['אפו עד שהמרכז יציב ומזהיב.', 'Bake until the middle is set and golden.', 35],
    ]),
  R('lentil-soup', 'מרק עדשים כתומות', 'Red lentil soup', { meal: ['lunch', 'dinner'], cuisine: 'middle-eastern', method: 'stew', time: 35, level: 1, servings: 4, art: 'soup', tags: ['soup', 'onepot'] },
    [['red-lentils', 200], ['onion', 150], ['carrot', 140], ['celery', 60], ['garlic', 10], ['olive-oil', 14], ['cumin', 3], ['turmeric', 2], ['broth', 800], ['lemon-juice', 20], ['salt', 5]],
    [
      ['טגנו בצל, גזר וסלרי קצוצים בשמן עד שמתרככים.', 'Soften the chopped onion, carrot and celery in the oil.', 7],
      ['הוסיפו שום, כמון וכורכום ולאחר דקה עדשים שטופות, ציר ומלח.', 'Add the garlic, cumin and turmeric, then after a minute the rinsed lentils, the stock and salt.', 1],
      ['בשלו עד שהעדשים מתפרקות.', 'Simmer until the lentils fall apart.', 20],
      ['טחנו בבלנדר מוט והוסיפו לימון.', 'Blend with a stick blender and add the lemon.'],
    ]),
  R('pumpkin-soup', 'מרק דלעת וג׳ינג׳ר', 'Pumpkin & ginger soup', { meal: ['lunch', 'dinner'], cuisine: 'home', method: 'stew', time: 40, level: 1, servings: 4, art: 'soup', tags: ['soup', 'onepot'] },
    [['pumpkin', 800], ['sweet-potato', 220], ['onion', 150], ['ginger', 10], ['olive-oil', 14], ['broth', 800], ['salt', 5], ['pepper', 1], ['coconut-milk', 100]],
    [
      ['טגנו בצל וג׳ינג׳ר בשמן.', 'Fry the onion and ginger in the oil.', 5],
      ['הוסיפו דלעת ובטטה בקוביות, ציר ומלח, ובשלו עד שרכים.', 'Add the pumpkin and sweet potato in cubes, the stock and salt; simmer until soft.', 25],
      ['טחנו חלק, הוסיפו חלב קוקוס ופלפל.', 'Blend smooth; stir in the coconut milk and pepper.'],
    ]),
  R('greek-salad', 'סלט יווני עם פטה', 'Greek salad with feta', { meal: ['lunch', 'dinner'], cuisine: 'mediterranean', method: 'raw', time: 10, level: 1, servings: 2, art: 'salad', tags: ['salad', 'nocook'] },
    [['tomato', 360], ['cucumber', 240], ['red-pepper', 80], ['onion', 50], ['olives', 40], ['feta', 100], ['olive-oil', 18], ['oregano', 1], ['lemon-juice', 15], ['pita-ww', 90]],
    [
      ['חתכו עגבניות, מלפפונים ופלפל לחתיכות גדולות ובצל לטבעות דקות.', 'Cut the tomatoes, cucumbers and pepper into large pieces and the onion into thin rings.'],
      ['הוסיפו זיתים ופטה בקוביות, טפטפו שמן ולימון ופזרו אורגנו.', 'Add the olives and feta cubes, drizzle the oil and lemon, sprinkle the oregano.'],
      ['הגישו עם פיתה.', 'Serve with pita.'],
    ]),
  R('chickpea-salad', 'סלט ישראלי עם חומוס וטחינה', 'Israeli salad with chickpeas & tahini', { meal: ['lunch', 'dinner'], cuisine: 'israeli', method: 'raw', time: 15, level: 1, servings: 2, art: 'salad', tags: ['salad', 'nocook'] },
    [['tomato', 240], ['cucumber', 240], ['red-pepper', 80], ['onion', 50], ['parsley', 15], ['chickpeas-cooked', 240], ['tahini', 30], ['lemon-juice', 25], ['olive-oil', 9], ['salt', 3], ['sumac', 2]],
    [
      ['קצצו דק עגבניות, מלפפונים, פלפל ובצל. הוסיפו פטרוזיליה וחומוס.', 'Finely dice the tomatoes, cucumbers, pepper and onion. Add the parsley and chickpeas.'],
      ['תבלו בלימון, שמן זית ומלח.', 'Dress with lemon, olive oil and salt.'],
      ['דללו טחינה במעט מים, יצקו מעל ופזרו סומק.', 'Thin the tahini with a little water, pour over and sprinkle the sumac.'],
    ]),
  R('sabich-bowl', 'קערת סביח בתנור', 'Oven sabich bowl', { meal: ['lunch', 'dinner'], cuisine: 'israeli', method: 'bake', time: 35, level: 1, servings: 2, art: 'bowl', crave: ['sabich'] },
    [['eggplant', 350], ['olive-oil', 18], ['salt', 3], ['egg', 110], ['hummus', 60], ['tahini', 20], ['tomato', 120], ['cucumber', 120], ['parsley', 10], ['lemon-juice', 10], ['pita-ww', 90]],
    [
      ['חממו תנור ל-220 מעלות. פרסו חציל לעיגולים, הברישו בשמן ומלח וצלו עד שרך ושחום.', 'Heat the oven to 220 °C. Slice the eggplant into rounds, brush with oil and salt and roast until soft and brown.', 25],
      ['בשלו ביצים 9 דקות, קררו וקלפו.', 'Boil the eggs 9 minutes, cool and peel.', 9],
      ['קצצו סלט קטן עם פטרוזיליה ולימון.', 'Chop a small salad with parsley and lemon.'],
      ['בקערה: חומוס, חציל, ביצה פרוסה, סלט וטחינה. פיתה לצד.', 'In a bowl: hummus, eggplant, sliced egg, salad and tahini. Pita on the side.'],
    ]),
  R('pesto-pasta', 'פסטה פסטו', 'Pesto pasta', { meal: ['lunch', 'dinner'], cuisine: 'italian', method: 'boil', time: 20, level: 1, servings: 2, art: 'pasta', crave: ['pasta'] },
    [['pasta-ww', 180], ['basil', 40], ['pine-nuts', 20], ['parmesan', 25], ['garlic', 5], ['olive-oil', 27], ['lemon-juice', 10], ['salt', 3], ['tomato', 120]],
    [
      ['בשלו את הפסטה לפי האריזה.', 'Cook the pasta as the package says.', 11],
      ['טחנו בזיליקום, צנוברים, פרמזן, שום, שמן, לימון ומלח לרסק.', 'Blend the basil, pine nuts, parmesan, garlic, oil, lemon and salt into a paste.'],
      ['סננו (שמרו מעט מים), ערבבו עם הפסטו ומעט מים עד שמבריק. הוסיפו עגבניות חצויות.', 'Drain (keep a little water), toss with the pesto and a splash of water until glossy. Add the halved tomatoes.'],
    ]),
  R('baked-falafel', 'פלאפל אפוי', 'Baked falafel', { meal: ['lunch', 'dinner'], cuisine: 'israeli', method: 'bake', time: 40, level: 2, servings: 3, art: 'pita', crave: ['falafel'] },
    // Soaked (not cooked) dried chickpeas: 250 g dry.
    [['chickpeas-dry', 250], ['onion', 100], ['garlic', 10], ['parsley', 20], ['cilantro', 20], ['cumin', 4], ['salt', 5], ['baking-powder', 4], ['olive-oil', 18], ['pita-ww', 270], ['tahini', 45], ['tomato', 240], ['cucumber', 120]],
    [
      ['השרו את החומוס היבש במים קרים 12 שעות (לא לבשל!) וסננו היטב.', 'Soak the dried chickpeas in cold water for 12 hours (do not cook them!) and drain well.'],
      ['טחנו במעבד מזון עם בצל, שום, עשבים, כמון ומלח לתערובת גרגירית. הוסיפו אבקת אפייה.', 'Pulse in a food processor with the onion, garlic, herbs, cumin and salt to a grainy mix. Add the baking powder.'],
      ['צרו כדורים פחוסים, הניחו בתבנית משומנת והברישו בשמן.', 'Shape flattened balls, put them on an oiled tray and brush with oil.'],
      ['אפו ב-200 מעלות, הפכו באמצע, עד שזהוב.', 'Bake at 200 °C until golden, turning halfway.', 25],
      ['הגישו בפיתה עם סלט וטחינה מדוללת.', 'Serve in pita with salad and thinned tahini.'],
    ]),
  R('pita-pizza', 'פיצה על פיתה', 'Pita pizza', { meal: ['lunch', 'dinner', 'snack'], cuisine: 'italian', method: 'bake', time: 15, level: 1, servings: 2, art: 'pizza', crave: ['pizza'] },
    [['pita-ww', 180], ['crushed-tomatoes', 120], ['oregano', 1], ['mozzarella', 80], ['mushrooms', 80], ['olives', 20], ['red-pepper', 50], ['salt', 1]],
    [
      ['חממו תנור ל-220 מעלות.', 'Heat the oven to 220 °C.'],
      ['מרחו עגבניות מרוסקות עם אורגנו ומלח על הפיתות.', 'Spread the crushed tomatoes with oregano and salt on the pitas.'],
      ['פזרו מוצרלה, פטריות, זיתים ופלפל.', 'Top with mozzarella, mushrooms, olives and pepper.'],
      ['אפו עד שהגבינה נמסה ומבעבעת.', 'Bake until the cheese melts and bubbles.', 8],
    ]),
  R('roasted-cauliflower-tahini', 'כרובית צלויה עם טחינה', 'Roasted cauliflower with tahini', { meal: ['lunch', 'dinner', 'snack'], cuisine: 'israeli', method: 'bake', time: 40, level: 1, servings: 2, art: 'plate' },
    [['cauliflower', 600], ['olive-oil', 18], ['salt', 3], ['tahini', 40], ['lemon-juice', 20], ['garlic', 3], ['parsley', 10], ['pomegranate', 40]],
    [
      ['חממו תנור ל-220 מעלות. פרקו כרובית לפרחים, ערבבו עם שמן ומלח.', 'Heat the oven to 220 °C. Break the cauliflower into florets; toss with oil and salt.'],
      ['צלו עד שהקצוות משחימים.', 'Roast until the edges brown.', 30],
      ['ערבבו טחינה, לימון, שום ומים לרוטב. יצקו, ופזרו פטרוזיליה ורימון.', 'Whisk the tahini, lemon, garlic and water into a sauce. Pour over; scatter the parsley and pomegranate.'],
    ]),
  R('roasted-veg-quinoa', 'סלט קינואה וירקות צלויים', 'Quinoa salad with roasted vegetables', { meal: ['lunch', 'dinner'], cuisine: 'mediterranean', method: 'bake', time: 40, level: 1, servings: 3, art: 'salad', tags: ['salad'] },
    [['quinoa', 150], ['sweet-potato', 220], ['red-pepper', 160], ['zucchini', 200], ['olive-oil', 27], ['salt', 4], ['chickpeas-cooked', 200], ['spinach', 60], ['lemon-juice', 25], ['almonds', 20]],
    [
      ['חממו תנור ל-220 מעלות. חתכו ירקות לקוביות, ערבבו עם חצי מהשמן ומלח וצלו.', 'Heat the oven to 220 °C. Dice the vegetables, toss with half the oil and salt and roast.', 25],
      ['בשלו קינואה ב-300 מ״ל מים מכוסה.', 'Cook the quinoa covered in 300 ml water.', 15],
      ['ערבבו קינואה, ירקות, חומוס ותרד עם לימון ושאר השמן. פזרו שקדים.', 'Toss the quinoa, vegetables, chickpeas and spinach with the lemon and remaining oil. Scatter the almonds.'],
    ]),
  R('tabbouleh', 'טאבולה', 'Tabbouleh', { meal: ['lunch', 'dinner'], cuisine: 'middle-eastern', method: 'raw', time: 25, level: 1, servings: 3, art: 'salad', tags: ['salad'] },
    [['bulgur', 80], ['parsley', 120], ['mint', 15], ['tomato', 240], ['cucumber', 120], ['spring-onion', 30], ['lemon-juice', 40], ['olive-oil', 27], ['salt', 3]],
    [
      ['השרו את הבורגול במים רותחים עד שמכסים, כסו ל-15 דקות וסננו.', 'Cover the bulgur with boiling water, cover for 15 minutes and drain.', 15],
      ['קצצו דק מאוד פטרוזיליה, נענע, עגבניות, מלפפון ובצל ירוק.', 'Very finely chop the parsley, mint, tomatoes, cucumber and spring onion.'],
      ['ערבבו הכל עם לימון, שמן ומלח.', 'Mix everything with the lemon, oil and salt.'],
    ]),
  R('hummus-mushroom-bowl', 'צלחת חומוס עם פטריות', 'Hummus plate with mushrooms', { meal: ['lunch', 'dinner'], cuisine: 'israeli', method: 'pan', time: 15, level: 1, servings: 2, art: 'plate' },
    [['hummus', 200], ['mushrooms', 250], ['onion', 100], ['olive-oil', 14], ['paprika', 1], ['salt', 2], ['parsley', 10], ['pita-ww', 180], ['egg', 110]],
    [
      ['בשלו ביצים 9 דקות.', 'Boil the eggs for 9 minutes.', 9],
      ['טגנו בצל ופטריות פרוסות בשמן עד שמשחימים, תבלו במלח.', 'Fry the onion and sliced mushrooms in the oil until browned; season with salt.', 8],
      ['מרחו חומוס בצלחת, הניחו פטריות במרכז, פפריקה ופטרוזיליה, וביצה חצויה. פיתה לצד.', 'Spread the hummus on a plate, put the mushrooms in the middle, then paprika, parsley and a halved egg. Pita on the side.'],
    ]),
  R('stuffed-zucchini-rice', 'קישואים ממולאים אורז (פרווה)', 'Zucchini stuffed with rice (parve)', { meal: ['lunch', 'dinner'], cuisine: 'middle-eastern', method: 'stew', time: 70, level: 2, servings: 4, art: 'pot' },
    [['zucchini', 800], ['rice', 150], ['onion', 150], ['parsley', 15], ['mint', 5], ['tomato', 120], ['olive-oil', 27], ['baharat', 3], ['salt', 6], ['crushed-tomatoes', 400], ['lemon-juice', 20]],
    [
      ['חצו את הקישואים לרוחב וחללו בעזרת כפית (שמרו את התוכן).', 'Cut the zucchini in half across and hollow them with a teaspoon (keep the flesh).'],
      ['ערבבו אורז שטוף, בצל קצוץ, עשבים, עגבנייה קצוצה, חצי מהשמן, תבלינים ומלח. מלאו ¾.', 'Mix the rinsed rice, chopped onion, herbs, chopped tomato, half the oil, spices and salt. Fill ¾ full.'],
      ['בסיר: תוכן הקישוא, עגבניות מרוסקות, לימון, שאר השמן וכוס מים. סדרו את הקישואים.', 'In a pot: the zucchini flesh, crushed tomatoes, lemon, the rest of the oil and a cup of water. Arrange the zucchini.'],
      ['כסו ובשלו על אש נמוכה עד שהאורז רך.', 'Cover and simmer until the rice is tender.', 50],
    ]),
  R('vegetable-curry', 'קארי ירקות וחומוס', 'Vegetable & chickpea curry', { meal: ['lunch', 'dinner'], cuisine: 'asian', method: 'stew', time: 35, level: 1, servings: 4, art: 'pot', tags: ['onepot'] },
    [['onion', 150], ['garlic', 10], ['ginger', 10], ['canola-oil', 14], ['turmeric', 3], ['cumin', 3], ['paprika', 3], ['chili', 5], ['cauliflower', 400], ['sweet-potato', 220], ['chickpeas-cooked', 300], ['crushed-tomatoes', 400], ['coconut-milk', 200], ['spinach', 100], ['salt', 5], ['rice', 240]],
    [
      ['טגנו בצל, שום וג׳ינג׳ר בשמן, הוסיפו תבלינים לדקה.', 'Fry the onion, garlic and ginger in the oil; add the spices for a minute.', 6],
      ['הוסיפו כרובית, בטטה בקוביות, חומוס, עגבניות, חלב קוקוס ומלח. בשלו מכוסה.', 'Add the cauliflower, cubed sweet potato, chickpeas, tomatoes, coconut milk and salt. Simmer covered.', 20],
      ['הוסיפו תרד בסוף. הגישו עם אורז.', 'Stir in the spinach at the end. Serve with rice.', 15],
    ]),
  R('bean-stew', 'תבשיל שעועית לבנה (פרווה)', 'White bean stew (parve)', { meal: ['lunch', 'dinner'], cuisine: 'home', method: 'stew', time: 40, level: 1, servings: 4, art: 'pot', tags: ['onepot'] },
    [['white-beans-cooked', 600], ['onion', 150], ['carrot', 70], ['celery', 60], ['garlic', 10], ['olive-oil', 14], ['tomato-paste', 30], ['paprika', 4], ['cumin', 2], ['broth', 400], ['salt', 5], ['bread-ww', 120]],
    [
      ['טגנו בצל, גזר וסלרי קצוצים בשמן.', 'Fry the chopped onion, carrot and celery in the oil.', 8],
      ['הוסיפו שום, רסק ותבלינים לדקה.', 'Add the garlic, paste and spices for a minute.', 1],
      ['הוסיפו שעועית, ציר ומלח ובשלו עד שהרוטב סמיך.', 'Add the beans, stock and salt and simmer until the sauce is thick.', 25],
      ['הגישו עם לחם מלא.', 'Serve with whole wheat bread.'],
    ]),
  R('cheese-omelette-bread', 'חביתת גבינה וירקות עם לחם', 'Cheese & vegetable omelette', { meal: ['breakfast', 'dinner'], cuisine: 'home', method: 'pan', time: 12, level: 1, servings: 1, art: 'egg' },
    [['egg', 110], ['yellow-cheese', 30], ['red-pepper', 50], ['spring-onion', 15], ['canola-oil', 5], ['salt', 1], ['bread-ww', 60], ['cucumber', 120]],
    [
      ['טרפו ביצים עם מלח, הוסיפו פלפל ובצל ירוק קצוצים.', 'Beat the eggs with salt; add the chopped pepper and spring onion.'],
      ['בשלו במחבת משומנת, פזרו גבינה וקפלו.', 'Cook in an oiled pan, sprinkle the cheese and fold.', 4],
      ['הגישו עם לחם ומלפפון.', 'Serve with bread and cucumber.'],
    ]),
  R('sweet-potato-fries', 'צ׳יפס בטטה בתנור', 'Oven sweet potato fries', { meal: ['snack', 'lunch'], cuisine: 'home', method: 'bake', time: 40, level: 1, servings: 2, art: 'plate', crave: ['fries'] },
    [['sweet-potato', 450], ['olive-oil', 14], ['paprika', 2], ['salt', 3], ['garlic-powder', 1]],
    [
      ['חממו תנור ל-220 מעלות (טורבו). חתכו בטטה למקלות דקים ושווים.', 'Heat the oven to 220 °C (fan). Cut the sweet potato into thin, even sticks.'],
      ['ערבבו עם שמן ותבלינים ופזרו בשכבה אחת, בלי צפיפות.', 'Toss with the oil and spices and spread in one layer, not crowded.'],
      ['אפו, הפכו באמצע, עד שפריך בשוליים.', 'Bake until crisp at the edges, turning halfway.', 28],
    ]),
  R('potato-wedges', 'פלחי תפוחי אדמה בתנור', 'Oven potato wedges', { meal: ['snack', 'lunch', 'dinner'], cuisine: 'home', method: 'bake', time: 45, level: 1, servings: 2, art: 'plate', crave: ['fries'] },
    [['potato', 540], ['olive-oil', 14], ['paprika', 2], ['thyme', 1], ['salt', 3]],
    [
      ['חממו תנור ל-220 מעלות. חתכו תפוחי אדמה עם הקליפה לפלחים.', 'Heat the oven to 220 °C. Cut the potatoes, skin on, into wedges.'],
      ['ערבבו עם שמן, פפריקה, טימין ומלח ופזרו בתבנית.', 'Toss with the oil, paprika, thyme and salt and spread on a tray.'],
      ['אפו, הפכו באמצע, עד שזהוב.', 'Bake until golden, turning halfway.', 35],
    ]),

  // ================================================================ snacks & sweet
  R('date-energy-balls', 'כדורי אנרגיה תמרים וטחינה', 'Date & tahini energy balls', { meal: ['snack'], cuisine: 'israeli', method: 'raw', time: 15, level: 1, servings: 6, art: 'sweet', tags: ['sweet', 'nocook'], crave: ['sweet'] },
    [['dates', 200], ['oats', 60], ['tahini', 40], ['cocoa', 10], ['almonds', 30], ['sesame', 10]],
    [
      ['הוציאו את הגלעינים מהתמרים.', 'Pit the dates.'],
      ['טחנו במעבד מזון תמרים, שיבולת שועל, טחינה, קקאו ושקדים לעיסה דביקה.', 'Process the dates, oats, tahini, cocoa and almonds to a sticky dough.'],
      ['גלגלו 12 כדורים וצפו בשומשום. שמרו במקרר.', 'Roll 12 balls and coat them in sesame. Keep in the fridge.'],
    ]),
  R('baked-apple', 'תפוח אפוי עם קינמון ואגוזים', 'Baked apple with cinnamon & walnuts', { meal: ['snack'], cuisine: 'home', method: 'bake', time: 35, level: 1, servings: 2, art: 'sweet', tags: ['sweet'], crave: ['sweet'] },
    [['apple', 360], ['walnuts', 20], ['raisins', 20], ['cinnamon', 2], ['silan', 14]],
    [
      ['חממו תנור ל-190 מעלות. הוציאו את ליבת התפוחים בלי לחתוך עד הסוף.', 'Heat the oven to 190 °C. Core the apples without cutting all the way through.'],
      ['מלאו באגוזים קצוצים, צימוקים וקינמון וטפטפו סילאן.', 'Fill with the chopped walnuts, raisins and cinnamon; drizzle the silan.'],
      ['אפו עם מעט מים בתחתית התבנית עד שרכים.', 'Bake with a little water in the dish until soft.', 25],
    ]),
  R('banana-oat-cookies', 'עוגיות בננה ושיבולת שועל', 'Banana oat cookies', { meal: ['snack'], cuisine: 'home', method: 'bake', time: 25, level: 1, servings: 6, art: 'sweet', tags: ['sweet'], crave: ['sweet'] },
    [['banana', 240], ['oats', 120], ['peanut-butter', 30], ['raisins', 30], ['cinnamon', 2]],
    [
      ['חממו תנור ל-180 מעלות. מעכו בננות וערבבו עם חמאת בוטנים.', 'Heat the oven to 180 °C. Mash the bananas and mix with the peanut butter.'],
      ['הוסיפו שיבולת שועל, צימוקים וקינמון.', 'Add the oats, raisins and cinnamon.'],
      ['צרו 12 עוגיות שטוחות על נייר אפייה ואפו עד שזהובות.', 'Shape 12 flat cookies on baking paper and bake until golden.', 15],
    ]),
  R('chocolate-protein-mousse', 'מוס שוקולד חלבון', 'Chocolate protein mousse', { meal: ['snack'], cuisine: 'home', method: 'raw', time: 5, level: 1, servings: 2, art: 'sweet', tags: ['sweet', 'nocook'], crave: ['chocolate', 'sweet'] },
    [['white-cheese', 250], ['cocoa', 15], ['honey', 21], ['banana', 60], ['strawberries', 100]],
    [
      ['טחנו גבינה לבנה, קקאו, דבש ובננה עד שחלק.', 'Blend the white cheese, cocoa, honey and banana until smooth.'],
      ['חלקו לשתי כוסות וקררו 30 דקות. הגישו עם תותים.', 'Divide between two glasses and chill 30 minutes. Serve with strawberries.'],
    ]),
  R('hummus-veg-sticks', 'חומוס עם מקלות ירקות', 'Hummus with vegetable sticks', { meal: ['snack'], cuisine: 'israeli', method: 'raw', time: 5, level: 1, servings: 1, art: 'plate', tags: ['nocook'] },
    [['hummus', 80], ['carrot', 70], ['cucumber', 120], ['red-pepper', 80]],
    [
      ['חתכו גזר, מלפפון ופלפל למקלות.', 'Cut the carrot, cucumber and pepper into sticks.'],
      ['הגישו עם החומוס לטבילה.', 'Serve with the hummus for dipping.'],
    ]),
  R('yogurt-berries', 'יוגורט עם פירות יער ושקדים', 'Yogurt with berries & almonds', { meal: ['snack', 'breakfast'], cuisine: 'home', method: 'raw', time: 3, level: 1, servings: 1, art: 'bowl', tags: ['nocook'] },
    [['yogurt-0', 200], ['blueberries', 80], ['almonds', 15], ['honey', 7]],
    [['שימו יוגורט בקערה, הוסיפו פירות, שקדים ודבש.', 'Put the yogurt in a bowl; add the berries, almonds and honey.']]),
  R('apple-peanut', 'תפוח עם חמאת בוטנים', 'Apple with peanut butter', { meal: ['snack'], cuisine: 'home', method: 'raw', time: 3, level: 1, servings: 1, art: 'sweet', tags: ['nocook'], crave: ['sweet'] },
    [['apple', 180], ['peanut-butter', 16], ['cinnamon', 0.5]],
    [['פרסו תפוח, מרחו מעט חמאת בוטנים ופזרו קינמון.', 'Slice the apple, spread a little peanut butter and sprinkle cinnamon.']]),
  R('cottage-veg-snack', 'קוטג׳ עם ירקות', 'Cottage cheese with vegetables', { meal: ['snack'], cuisine: 'israeli', method: 'raw', time: 3, level: 1, servings: 1, art: 'bowl', tags: ['nocook'] },
    [['cottage', 125], ['cucumber', 120], ['tomato', 60], ['pepper', 0.5]],
    [['קצצו ירקות וערבבו עם הקוטג׳ ופלפל שחור.', 'Dice the vegetables and stir into the cottage cheese with black pepper.']]),
  R('stuffed-dates', 'תמרים ממולאים בשקדים', 'Almond-stuffed dates', { meal: ['snack'], cuisine: 'middle-eastern', method: 'raw', time: 5, level: 1, servings: 2, art: 'sweet', tags: ['sweet', 'nocook'], crave: ['sweet'] },
    [['dates', 96], ['almonds', 20], ['tahini', 10]],
    [['פתחו את התמרים, הוציאו גלעין, מלאו בשקדים וטפטפו טחינה.', 'Open the dates, take out the pits, stuff with almonds and drizzle tahini.']]),
];

export const RECIPE = new Map(RECIPES.map((r) => [r.id, r]));
