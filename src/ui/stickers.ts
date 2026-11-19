// Bloom stickers — 64×64 drawings in pastel earthy colors (approved designs).
// Each value is SVG markup drawn inside a 64×64 box; the sticker border and
// shadow are added around it by a shared filter.
const L = '#6b4f43'; // soft brown outline
const C = {
  terra: '#e3a587', clay: '#c99b7e', sand: '#ecd7b4', cream: '#f8efe2', rose: '#e8b4b5', blush: '#f3cfc7',
  sage: '#a9c4a0', moss: '#8fae86', mustard: '#e9c77f', sky: '#a9c4d9', lav: '#c4b6da', choco: '#9b7563', white: '#fffaf3',
};
const s = (extra = ''): string => `stroke="${L}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ${extra}`;

export const STICKERS: Record<string, { label: string; labelHe: string; svg: string }> = {
  // ---------------- health
  injection: { label: 'Injection', labelHe: 'זריקה', svg: `
    <g transform="rotate(-45 32 32)">
      <rect x="27" y="4" width="10" height="5" rx="2" fill="${C.sand}" ${s()}/>
      <line x1="32" y1="9" x2="32" y2="15" ${s()}/>
      <rect x="20" y="15" width="24" height="4" rx="2" fill="${C.clay}" ${s()}/>
      <rect x="24" y="19" width="16" height="26" rx="3" fill="${C.white}" ${s()}/>
      <rect x="26" y="31" width="12" height="12" rx="1.5" fill="${C.rose}"/>
      <line x1="24" y1="26" x2="29" y2="26" ${s('stroke-width="1.8"')}/><line x1="24" y1="32" x2="29" y2="32" ${s('stroke-width="1.8"')}/>
      <path d="M29 45h6l-1 4h-4z" fill="${C.sky}" ${s()}/>
      <line x1="32" y1="49" x2="32" y2="60" ${s()}/>
    </g>` },
  pill: { label: 'Medicine', labelHe: 'תרופה', svg: `
    <g transform="rotate(-35 28 30)">
      <rect x="12" y="21" width="34" height="17" rx="8.5" fill="${C.white}" ${s()}/>
      <path d="M29 21h8.5a8.5 8.5 0 0 1 0 17H29z" fill="${C.terra}" ${s()}/>
    </g>
    <circle cx="46" cy="46" r="9" fill="${C.sage}" ${s()}/><line x1="40" y1="46" x2="52" y2="46" ${s('stroke-width="2"')}/>` },
  doctor: { label: 'Doctor', labelHe: 'רופא', svg: `
    <path d="M18 10v14a10 10 0 0 0 20 0V10" fill="none" ${s('stroke-width="3"')}/>
    <path d="M28 34v8a10 10 0 0 0 20 0v-6" fill="none" ${s('stroke-width="3"')}/>
    <circle cx="48" cy="31" r="6" fill="${C.sky}" ${s()}/><circle cx="48" cy="31" r="2" fill="${L}"/>
    <rect x="14" y="7" width="8" height="5" rx="2.5" fill="${C.clay}" ${s()}/><rect x="34" y="7" width="8" height="5" rx="2.5" fill="${C.clay}" ${s()}/>` },
  hospital: { label: 'Hospital', labelHe: 'בית חולים', svg: `
    <rect x="10" y="20" width="44" height="36" rx="3" fill="${C.cream}" ${s()}/>
    <rect x="22" y="10" width="20" height="14" rx="3" fill="${C.white}" ${s()}/>
    <path d="M30 13h4v3h3v4h-3v3h-4v-3h-3v-4h3z" fill="${C.terra}" ${s('stroke-width="1.6"')}/>
    <rect x="15" y="28" width="7" height="7" rx="1.5" fill="${C.sky}" ${s('stroke-width="1.8"')}/><rect x="42" y="28" width="7" height="7" rx="1.5" fill="${C.sky}" ${s('stroke-width="1.8"')}/>
    <rect x="15" y="40" width="7" height="7" rx="1.5" fill="${C.sky}" ${s('stroke-width="1.8"')}/><rect x="42" y="40" width="7" height="7" rx="1.5" fill="${C.sky}" ${s('stroke-width="1.8"')}/>
    <path d="M27 56V44h10v12" fill="${C.sage}" ${s()}/>` },
  dentist: { label: 'Dentist', labelHe: 'רופא שיניים', svg: `
    <path d="M20 12c-7 0-10 7-8 14 2 6 3 9 4 16 1 6 2 12 6 12 3 0 3-6 5-11 1-3 4-3 5 0 2 5 2 11 5 11 4 0 5-6 6-12 1-7 2-10 4-16 2-7-1-14-8-14-5 0-7 3-12 3s-7-3-12-3z" fill="${C.white}" ${s()}/>
    <path d="M18 20c1-3 3-4 6-4" fill="none" ${s('stroke-width="2"')}/>
    <circle cx="44" cy="20" r="2.5" fill="${C.blush}"/>` },
  cycle: { label: 'Cycle', labelHe: 'מחזור', svg: `
    <path d="M32 8C26 18 16 28 16 38a16 16 0 0 0 32 0C48 28 38 18 32 8z" fill="${C.rose}" ${s()}/>
    <path d="M32 46l-6-6a3.5 3.5 0 0 1 6-4 3.5 3.5 0 0 1 6 4z" fill="${C.white}" ${s('stroke-width="1.8"')}/>
    <path d="M22 34c0-3 2-7 4-9" fill="none" stroke="${C.white}" stroke-width="2.4" stroke-linecap="round"/>` },
  // ---------------- work & study
  work: { label: 'Work', labelHe: 'עבודה', svg: `
    <path d="M24 18v-4a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v4" fill="none" ${s()}/>
    <rect x="9" y="18" width="46" height="34" rx="5" fill="${C.clay}" ${s()}/>
    <path d="M9 32h46" ${s()}/><rect x="28" y="28" width="8" height="8" rx="2" fill="${C.mustard}" ${s()}/>` },
  homework: { label: 'Homework', labelHe: 'שיעורי בית', svg: `
    <rect x="12" y="10" width="32" height="44" rx="3" fill="${C.cream}" ${s()}/>
    <line x1="18" y1="10" x2="18" y2="54" stroke="${C.terra}" stroke-width="2"/>
    <line x1="22" y1="22" x2="38" y2="22" ${s('stroke-width="1.8"')}/><line x1="22" y1="30" x2="38" y2="30" ${s('stroke-width="1.8"')}/><line x1="22" y1="38" x2="32" y2="38" ${s('stroke-width="1.8"')}/>
    <g transform="rotate(35 46 36)"><rect x="42" y="14" width="8" height="32" rx="1" fill="${C.mustard}" ${s()}/><path d="M42 46l4 8 4-8z" fill="${C.sand}" ${s()}/><rect x="42" y="10" width="8" height="5" rx="2" fill="${C.rose}" ${s()}/></g>` },
  study: { label: 'Exam / Study', labelHe: 'מבחן / לימודים', svg: `
    <path d="M32 12L6 24l26 12 26-12z" fill="${C.choco}" ${s()}/>
    <path d="M16 29v11c0 5 7 9 16 9s16-4 16-9V29l-16 7z" fill="${C.clay}" ${s()}/>
    <path d="M54 26v14" ${s()}/><circle cx="54" cy="43" r="3" fill="${C.mustard}" ${s()}/>` },
  meeting: { label: 'Meeting', labelHe: 'פגישה', svg: `
    <path d="M8 14h30a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H20l-8 6v-6H8a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4z" fill="${C.sky}" ${s()}/>
    <path d="M56 26H34a4 4 0 0 0-4 4v12a4 4 0 0 0 4 4h12l7 5v-5h3a4 4 0 0 0 4-4V30a4 4 0 0 0-4-4z" fill="${C.blush}" ${s()}/>
    <circle cx="14" cy="25" r="1.8" fill="${L}"/><circle cx="21" cy="25" r="1.8" fill="${L}"/><circle cx="28" cy="25" r="1.8" fill="${L}"/>` },
  call: { label: 'Call', labelHe: 'שיחה', svg: `
    <path d="M20 8l7 13-5 5c3 7 8 12 15 15l5-5 13 7-3 10c-1 2-3 3-5 3C27 55 9 37 8 17c0-2 1-4 3-5z" fill="${C.sage}" ${s()}/>
    <path d="M40 10a14 14 0 0 1 14 14M40 18a6 6 0 0 1 6 6" fill="none" ${s()}/>` },
  mail: { label: 'Mail', labelHe: 'דואר', svg: `
    <rect x="8" y="16" width="48" height="34" rx="4" fill="${C.cream}" ${s()}/>
    <path d="M10 19l22 17 22-17" fill="none" ${s()}/>
    <circle cx="48" cy="20" r="7" fill="${C.terra}" ${s()}/>` },
  bills: { label: 'Bills', labelHe: 'חשבונות', svg: `
    <ellipse cx="30" cy="46" rx="16" ry="6" fill="${C.mustard}" ${s()}/>
    <path d="M14 46v-6c0 3 7 6 16 6s16-3 16-6v6" fill="${C.mustard}" ${s()}/>
    <ellipse cx="30" cy="38" rx="16" ry="6" fill="${C.mustard}" ${s()}/>
    <path d="M14 38v-6c0 3 7 6 16 6s16-3 16-6v6" fill="${C.mustard}" ${s()}/>
    <ellipse cx="30" cy="30" rx="16" ry="6" fill="#f2d99b" ${s()}/>
    <rect x="38" y="8" width="18" height="24" rx="2" fill="${C.sage}" ${s()} transform="rotate(12 47 20)"/>` },
  // ---------------- travel & fun
  travel: { label: 'Travel', labelHe: 'טיסה', svg: `
    <path d="M30 8c2-2 6-2 6 2v14l18 10v6l-18-5v11l6 5v4l-9-3-9 3v-4l6-5V31l-18 5v-6l18-10V10c0-1 0-2 0-2z" fill="${C.sky}" ${s()}/>` },
  vacation: { label: 'Vacation', labelHe: 'חופשה', svg: `
    <rect x="12" y="20" width="40" height="34" rx="5" fill="${C.terra}" ${s()}/>
    <path d="M24 20v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6" fill="none" ${s()}/>
    <line x1="22" y1="20" x2="22" y2="54" ${s()}/><line x1="42" y1="20" x2="42" y2="54" ${s()}/>
    <circle cx="32" cy="36" r="5" fill="${C.mustard}" ${s('stroke-width="1.8"')}/>
    <rect x="44" y="40" width="6" height="8" rx="1" fill="${C.sage}" ${s('stroke-width="1.6"')} transform="rotate(-12 47 44)"/>` },
  beach: { label: 'Beach', labelHe: 'ים', svg: `
    <path d="M6 54c8-4 18-6 26-6s18 2 26 6z" fill="${C.sand}" ${s()}/>
    <path d="M32 50L26 22" ${s()}/>
    <path d="M8 26C10 14 20 7 32 8s20 10 20 20c-4-3-9-4-14-2-3-4-9-5-14-2-5-3-11-2-16 2z" fill="${C.rose}" ${s()}/>
    <path d="M24 24c0-7 3-12 8-16M38 26c1-7 0-13-6-18" fill="none" ${s('stroke-width="1.8"')}/>
    <circle cx="50" cy="44" r="4" fill="${C.mustard}" ${s('stroke-width="1.8"')}/>` },
  car: { label: 'Drive', labelHe: 'נסיעה', svg: `
    <path d="M10 40v-6l5-12a4 4 0 0 1 4-3h26a4 4 0 0 1 4 3l5 12v6z" fill="${C.sage}" ${s()}/>
    <path d="M17 31l3-7h24l3 7z" fill="${C.sky}" ${s()}/>
    <rect x="8" y="38" width="48" height="8" rx="3" fill="${C.moss}" ${s()}/>
    <circle cx="19" cy="47" r="6" fill="${C.choco}" ${s()}/><circle cx="45" cy="47" r="6" fill="${C.choco}" ${s()}/>` },
  party: { label: 'Party', labelHe: 'מסיבה', svg: `
    <path d="M24 34c-8 0-12-7-12-13a12 12 0 0 1 24 0c0 6-4 13-12 13z" fill="${C.rose}" ${s()}/>
    <path d="M42 30c-7 0-10-6-10-11a10 10 0 0 1 20 0c0 5-3 11-10 11z" fill="${C.mustard}" ${s()}/>
    <path d="M24 34c-1 8 3 12 0 22M42 30c2 8-2 14 2 24" fill="none" ${s('stroke-width="1.8"')}/>
    <path d="M17 18c1-3 3-4 5-4" fill="none" stroke="${C.white}" stroke-width="2.2" stroke-linecap="round"/>` },
  birthday: { label: 'Birthday', labelHe: 'יום הולדת', svg: `
    <rect x="12" y="30" width="40" height="24" rx="4" fill="${C.blush}" ${s()}/>
    <path d="M12 38c5 4 8 4 13 0s8-4 13 0 9 4 14 0" fill="none" ${s('stroke-width="2"')}/>
    <rect x="28" y="16" width="8" height="14" rx="2" fill="${C.sky}" ${s()}/>
    <path d="M32 6c3 4 3 6 0 8-3-2-3-4 0-8z" fill="${C.mustard}" ${s('stroke-width="1.8"')}/>` },
  gift: { label: 'Gift', labelHe: 'מתנה', svg: `
    <rect x="10" y="26" width="44" height="12" rx="2" fill="${C.terra}" ${s()}/>
    <rect x="14" y="38" width="36" height="18" rx="2" fill="${C.terra}" ${s()}/>
    <rect x="28" y="26" width="8" height="30" fill="${C.sage}" ${s()}/>
    <path d="M32 26c-4-8-14-12-14-4 0 4 8 4 14 4zM32 26c4-8 14-12 14-4 0 4-8 4-14 4z" fill="${C.sage}" ${s()}/>` },
  date: { label: 'Date night', labelHe: 'דייט', svg: `
    <path d="M32 54S8 40 8 24c0-8 6-13 12-13 5 0 9 3 12 7 3-4 7-7 12-7 6 0 12 5 12 13 0 16-24 30-24 30z" fill="${C.rose}" ${s()}/>
    <path d="M18 21c1-3 3-4 5-4" fill="none" stroke="${C.white}" stroke-width="2.4" stroke-linecap="round"/>` },
  anniversary: { label: 'Anniversary', labelHe: 'יום נישואין', svg: `
    <circle cx="32" cy="40" r="15" fill="none" stroke="${C.mustard}" stroke-width="6"/>
    <circle cx="32" cy="40" r="15" fill="none" ${s('stroke-width="1.8"')}/><circle cx="32" cy="40" r="9" fill="none" ${s('stroke-width="1.8"')}/>
    <path d="M24 18l4-8h8l4 8-8 8z" fill="${C.sky}" ${s()}/>` },
  movie: { label: 'Movie', labelHe: 'סרט', svg: `
    <path d="M16 24h32l-4 32H20z" fill="${C.white}" ${s()}/>
    <path d="M24 24l2 32M32 24v32M40 24l-2 32" stroke="${C.terra}" stroke-width="3"/>
    <path d="M16 24h32l-4 32H20z" fill="none" ${s()}/>
    <circle cx="22" cy="18" r="6" fill="${C.cream}" ${s()}/><circle cx="32" cy="14" r="7" fill="${C.cream}" ${s()}/><circle cx="42" cy="18" r="6" fill="${C.cream}" ${s()}/>` },
  music: { label: 'Music', labelHe: 'מוזיקה', svg: `
    <path d="M24 44V14l26-6v30" fill="none" ${s('stroke-width="3"')}/>
    <path d="M24 20l26-6" ${s('stroke-width="3"')}/>
    <ellipse cx="18" cy="46" rx="8" ry="6" fill="${C.lav}" ${s()}/><ellipse cx="44" cy="40" rx="8" ry="6" fill="${C.lav}" ${s()}/>` },
  gaming: { label: 'Gaming', labelHe: 'גיימינג', svg: `
    <path d="M18 18h28c6 0 9 4 10 10l2 14c1 6-6 9-10 4l-5-6H21l-5 6c-4 5-11 2-10-4l2-14c1-6 4-10 10-10z" fill="${C.lav}" ${s()}/>
    <path d="M18 27v8M14 31h8" ${s()}/><circle cx="42" cy="29" r="2.4" fill="${C.terra}"/><circle cx="47" cy="34" r="2.4" fill="${C.sage}"/>` },
  // ---------------- home & life
  home: { label: 'Home', labelHe: 'בית', svg: `
    <path d="M8 30L32 10l24 20" fill="none" ${s('stroke-width="3"')}/>
    <path d="M14 26v28h36V26L32 12z" fill="${C.cream}" ${s()}/>
    <path d="M14 26L32 12l18 14" fill="${C.terra}" ${s()}/>
    <rect x="27" y="38" width="10" height="16" rx="2" fill="${C.sage}" ${s()}/>` },
  cleaning: { label: 'Cleaning', labelHe: 'ניקיון', svg: `
    <path d="M24 22h12v6l4 6v20a2 2 0 0 1-2 2H22a2 2 0 0 1-2-2V34l4-6z" fill="${C.sky}" ${s()}/>
    <path d="M24 22v-8h8l10 4v4H24" fill="${C.sage}" ${s()}/>
    <rect x="23" y="38" width="14" height="10" rx="2" fill="${C.white}" ${s('stroke-width="1.8"')}/>
    <circle cx="50" cy="12" r="2" fill="${C.sky}"/><circle cx="54" cy="20" r="2" fill="${C.sky}"/><circle cx="48" cy="24" r="1.6" fill="${C.sky}"/>` },
  laundry: { label: 'Laundry', labelHe: 'כביסה', svg: `
    <rect x="12" y="8" width="40" height="48" rx="5" fill="${C.white}" ${s()}/>
    <line x1="12" y1="18" x2="52" y2="18" ${s()}/>
    <circle cx="32" cy="37" r="12" fill="${C.sky}" ${s()}/>
    <path d="M22 39c4-3 7 3 10 0s6-3 10 0" fill="none" ${s('stroke-width="1.8"')}/>
    <circle cx="19" cy="13" r="2" fill="${C.terra}"/><circle cx="26" cy="13" r="2" fill="${C.sage}"/>` },
  groceries: { label: 'Groceries', labelHe: 'קניות סופר', svg: `
    <path d="M10 26h44l-5 28H15z" fill="${C.sand}" ${s()}/>
    <path d="M20 26l8-14M44 26l-8-14" ${s()}/>
    <path d="M22 26c0-6 4-8 6-8" fill="none" stroke="${C.moss}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="40" cy="22" r="6" fill="${C.terra}" ${s()}/>
    <path d="M20 34v14M32 34v14M44 34v14" ${s('stroke-width="1.8"')}/>` },
  shopping: { label: 'Shopping', labelHe: 'קניות', svg: `
    <path d="M14 22h36l3 34H11z" fill="${C.rose}" ${s()}/>
    <path d="M24 26v-8a8 8 0 0 1 16 0v8" fill="none" ${s()}/>
    <circle cx="24" cy="27" r="2" fill="${L}"/><circle cx="40" cy="27" r="2" fill="${L}"/>` },
  cooking: { label: 'Cooking', labelHe: 'בישול', svg: `
    <path d="M12 30h40v14a10 10 0 0 1-10 10H22a10 10 0 0 1-10-10z" fill="${C.clay}" ${s()}/>
    <path d="M8 30h48" ${s('stroke-width="3"')}/><rect x="28" y="24" width="8" height="6" rx="2" fill="${C.choco}" ${s()}/>
    <path d="M22 18c-2-3 2-5 0-8M32 18c-2-3 2-5 0-8M42 18c-2-3 2-5 0-8" fill="none" ${s('stroke-width="1.8"')}/>` },
  coffee: { label: 'Coffee', labelHe: 'קפה', svg: `
    <path d="M12 24h34v16a12 12 0 0 1-12 12h-10a12 12 0 0 1-12-12z" fill="${C.cream}" ${s()}/>
    <path d="M46 28h4a6 6 0 0 1 0 12h-5" fill="none" ${s()}/>
    <path d="M16 28h26" stroke="${C.choco}" stroke-width="5"/>
    <path d="M22 18c-2-3 2-5 0-8M32 18c-2-3 2-5 0-8" fill="none" ${s('stroke-width="1.8"')}/>
    <path d="M24 38l5 4 5-4a3 3 0 0 0-5-3 3 3 0 0 0-5 3z" fill="${C.rose}"/>` },
  restaurant: { label: 'Restaurant', labelHe: 'מסעדה', svg: `
    <circle cx="32" cy="34" r="20" fill="${C.white}" ${s()}/><circle cx="32" cy="34" r="12" fill="${C.sand}" ${s('stroke-width="1.8"')}/>
    <path d="M6 12v10a4 4 0 0 0 4 4v28M10 12v10M14 12v10a4 4 0 0 1-4 4" fill="none" ${s()}/>
    <path d="M54 54V12c-5 3-6 10-6 18h6" fill="${C.cream}" ${s()}/>` },
  plants: { label: 'Water plants', labelHe: 'השקיית צמחים', svg: `
    <path d="M18 38h28l-4 18H22z" fill="${C.terra}" ${s()}/>
    <path d="M32 38V22" ${s()}/>
    <path d="M32 26c-10 0-14-6-14-12 8 0 14 4 14 12zM32 22c0-8 6-12 14-12 0 6-4 12-14 12z" fill="${C.sage}" ${s()}/>` },
  pet: { label: 'Pet', labelHe: 'חיית מחמד', svg: `
    <ellipse cx="32" cy="42" rx="12" ry="10" fill="${C.clay}" ${s()}/>
    <ellipse cx="16" cy="28" rx="5" ry="6" fill="${C.clay}" ${s()}/><ellipse cx="25" cy="18" rx="5" ry="6" fill="${C.clay}" ${s()}/>
    <ellipse cx="39" cy="18" rx="5" ry="6" fill="${C.clay}" ${s()}/><ellipse cx="48" cy="28" rx="5" ry="6" fill="${C.clay}" ${s()}/>` },
  // ---------------- body & mind
  gym: { label: 'Gym', labelHe: 'חדר כושר', svg: `
    <rect x="22" y="29" width="20" height="6" rx="2" fill="${C.sand}" ${s()}/>
    <rect x="12" y="18" width="10" height="28" rx="3" fill="${C.choco}" ${s()}/><rect x="42" y="18" width="10" height="28" rx="3" fill="${C.choco}" ${s()}/>
    <rect x="6" y="24" width="6" height="16" rx="2" fill="${C.clay}" ${s()}/><rect x="52" y="24" width="6" height="16" rx="2" fill="${C.clay}" ${s()}/>` },
  run: { label: 'Run', labelHe: 'ריצה', svg: `
    <path d="M10 40l4-14 10 4c4-6 8-10 14-10l4 8c6 2 12 4 14 10v4c0 3-2 5-5 5H14c-3 0-5-3-4-7z" fill="${C.sky}" ${s()}/>
    <path d="M10 44h46" ${s()}/><path d="M30 30l4 4M34 26l4 4" ${s('stroke-width="1.8"')}/>
    <path d="M10 49h44" stroke="${C.white}" stroke-width="5" stroke-linecap="round"/><path d="M10 49h44" ${s('stroke-width="1.2"')}/>` },
  yoga: { label: 'Yoga', labelHe: 'יוגה', svg: `
    <path d="M32 52c-6-6-8-14-8-20 0-8 4-14 8-18 4 4 8 10 8 18 0 6-2 14-8 20z" fill="${C.lav}" ${s()}/>
    <path d="M32 52c-10-2-18-8-22-16 8-2 16 0 22 6M32 52c10-2 18-8 22-16-8-2-16 0-22 6" fill="${C.blush}" ${s()}/>` },
  sleep: { label: 'Sleep / Rest', labelHe: 'שינה / מנוחה', svg: `
    <path d="M40 10a20 20 0 1 0 14 34A22 22 0 0 1 40 10z" fill="${C.lav}" ${s()}/>
    <path d="M42 18h8l-8 8h8" fill="none" ${s('stroke-width="2"')}/>` },
  dayoff: { label: 'Day off', labelHe: 'יום חופש', svg: `
    <circle cx="32" cy="32" r="12" fill="${C.mustard}" ${s()}/>
    <g ${s()}><path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4 4M45 45l4 4M15 49l4-4M45 19l4-4"/></g>
    <path d="M27 34c2 3 8 3 10 0" fill="none" ${s('stroke-width="2"')}/><circle cx="28" cy="29" r="1.4" fill="${L}"/><circle cx="36" cy="29" r="1.4" fill="${L}"/>` },
  // ---------------- misc
  rain: { label: 'Rain', labelHe: 'גשם', svg: `
    <path d="M18 34a10 10 0 0 1 2-20 14 14 0 0 1 26 4 8 8 0 0 1 0 16z" fill="${C.sky}" ${s()}/>
    <path d="M22 42l-3 8M32 42l-3 8M42 42l-3 8" ${s()}/>` },
  shabbat: { label: 'Shabbat', labelHe: 'שבת', svg: `
    <rect x="16" y="26" width="10" height="28" rx="2" fill="${C.cream}" ${s()}/><rect x="38" y="26" width="10" height="28" rx="2" fill="${C.cream}" ${s()}/>
    <path d="M21 10c4 5 4 9 0 12-4-3-4-7 0-12zM43 10c4 5 4 9 0 12-4-3-4-7 0-12z" fill="${C.mustard}" ${s('stroke-width="1.8"')}/>
    <path d="M10 54h44" ${s('stroke-width="3"')}/>` },
  haircut: { label: 'Haircut', labelHe: 'תספורת', svg: `
    <circle cx="18" cy="46" r="8" fill="${C.rose}" ${s()}/><circle cx="18" cy="46" r="3.5" fill="${C.white}" ${s('stroke-width="1.6"')}/>
    <circle cx="46" cy="46" r="8" fill="${C.rose}" ${s()}/><circle cx="46" cy="46" r="3.5" fill="${C.white}" ${s('stroke-width="1.6"')}/>
    <path d="M23 40L46 8M41 40L18 8" ${s('stroke-width="3"')}/>` },
  nails: { label: 'Nails / Spa', labelHe: 'ציפורניים / ספא', svg: `
    <rect x="22" y="26" width="20" height="28" rx="5" fill="${C.rose}" ${s()}/>
    <rect x="26" y="14" width="12" height="12" rx="2" fill="${C.choco}" ${s()}/>
    <path d="M30 14V8h4v6" fill="${C.clay}" ${s()}/>
    <path d="M27 34c1-2 3-3 5-3" fill="none" stroke="${C.white}" stroke-width="2.2" stroke-linecap="round"/>` },
  flowers: { label: 'Flowers', labelHe: 'פרחים', svg: `
    <path d="M32 56V30" stroke="${C.moss}" stroke-width="3"/>
    <path d="M32 46c-6 0-10-4-10-8 6 0 10 3 10 8z" fill="${C.sage}" ${s('stroke-width="1.8"')}/>
    <g fill="${C.blush}" ${s()}><circle cx="32" cy="14" r="6"/><circle cx="41" cy="21" r="6"/><circle cx="37" cy="31" r="6"/><circle cx="27" cy="31" r="6"/><circle cx="23" cy="21" r="6"/></g>
    <circle cx="32" cy="23" r="5" fill="${C.mustard}" ${s()}/>` },
  important: { label: 'Important', labelHe: 'חשוב', svg: `
    <path d="M32 6l7 16 17 2-13 11 4 17-15-9-15 9 4-17L8 24l17-2z" fill="${C.mustard}" ${s()}/>
    <path d="M24 26c1-3 3-4 5-4" fill="none" stroke="${C.white}" stroke-width="2.4" stroke-linecap="round"/>` },
  done: { label: 'Done', labelHe: 'בוצע', svg: `
    <circle cx="32" cy="32" r="24" fill="${C.sage}" ${s()}/>
    <path d="M21 33l7 7 15-16" fill="none" stroke="${C.white}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 33l7 7 15-16" fill="none" ${s('stroke-width="1.6"')}/>` },
  idea: { label: 'Idea', labelHe: 'רעיון', svg: `
    <path d="M32 8a16 16 0 0 0-9 29c2 2 3 4 3 7h12c0-3 1-5 3-7a16 16 0 0 0-9-29z" fill="${C.mustard}" ${s()}/>
    <rect x="25" y="44" width="14" height="6" rx="2" fill="${C.sand}" ${s()}/><rect x="27" y="50" width="10" height="5" rx="2" fill="${C.sand}" ${s()}/>
    <path d="M25 18c2-3 5-4 8-4" fill="none" stroke="${C.white}" stroke-width="2.4" stroke-linecap="round"/>` },
  baby: { label: 'Family', labelHe: 'משפחה', svg: `
    <circle cx="22" cy="20" r="8" fill="${C.blush}" ${s()}/><circle cx="44" cy="26" r="6" fill="${C.sand}" ${s()}/>
    <path d="M10 54c0-12 5-20 12-20s12 8 12 20z" fill="${C.sage}" ${s()}/>
    <path d="M34 54c0-9 4-16 10-16s10 7 10 16z" fill="${C.sky}" ${s()}/>` },
};
