// Kitchen dish pictures: 64×64 drawings in the same pastel sticker style as
// stickerDesigns.ts (drawn for Bloom). Shown with the shared sticker filter.
const L = '#6b4f43';
const C = {
  terra: '#e3a587', clay: '#c99b7e', sand: '#ecd7b4', cream: '#f8efe2', rose: '#e8b4b5', blush: '#f3cfc7',
  sage: '#a9c4a0', moss: '#8fae86', mustard: '#e9c77f', sky: '#a9c4d9', lav: '#c4b6da', choco: '#9b7563', white: '#fffaf3',
};
const s = (extra = ''): string => `stroke="${L}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ${extra}`;
const plate = `<ellipse cx="32" cy="40" rx="27" ry="14" fill="${C.white}" ${s()}/><ellipse cx="32" cy="38" rx="18" ry="8" fill="${C.cream}" ${s('stroke-width="1.6"')}/>`;
const bowl = (fill: string) => `<path d="M8 30h48a24 22 0 0 1-48 0z" fill="${fill}" ${s()}/><path d="M24 52h16" ${s()}/>`;

export const DISH_ART: Record<string, string> = {
  pan: `<path d="M8 34h38v4a12 12 0 0 1-12 12H20A12 12 0 0 1 8 38z" fill="${C.clay}" ${s()}/><path d="M46 38h12" ${s('stroke-width="4"')}/>
    <ellipse cx="27" cy="34" rx="18" ry="6" fill="${C.terra}" ${s()}/><circle cx="21" cy="33" r="4" fill="${C.white}" ${s('stroke-width="1.6"')}/><circle cx="21" cy="33" r="1.8" fill="${C.mustard}"/>
    <circle cx="33" cy="34" r="4" fill="${C.white}" ${s('stroke-width="1.6"')}/><circle cx="33" cy="34" r="1.8" fill="${C.mustard}"/><path d="M27 29l1-2M38 31l2-1" ${s('stroke="' + C.moss + '"')}/>`,
  pot: `<path d="M12 26h40v18a10 10 0 0 1-10 10H22a10 10 0 0 1-10-10z" fill="${C.terra}" ${s()}/><path d="M8 26h48" ${s('stroke-width="3"')}/>
    <path d="M12 32H7M52 32h5" ${s('stroke-width="3"')}/><path d="M24 18c-2-3 2-5 0-8M32 18c-2-3 2-5 0-8M40 18c-2-3 2-5 0-8" fill="none" ${s('stroke-width="1.8"')}/>`,
  bowl: `${bowl(C.sand)}<circle cx="22" cy="27" r="5" fill="${C.sage}" ${s('stroke-width="1.6"')}/><circle cx="33" cy="25" r="5" fill="${C.terra}" ${s('stroke-width="1.6"')}/><circle cx="43" cy="27" r="5" fill="${C.mustard}" ${s('stroke-width="1.6"')}/>`,
  salad: `${bowl(C.cream)}<path d="M14 29c4-9 10-9 13-2 3-8 11-8 13 0 3-6 9-5 11 2" fill="${C.sage}" ${s('stroke-width="1.8"')}/><circle cx="26" cy="27" r="3" fill="${C.rose}" ${s('stroke-width="1.4"')}/><circle cx="40" cy="26" r="3" fill="${C.rose}" ${s('stroke-width="1.4"')}/>`,
  soup: `${bowl(C.mustard)}<path d="M8 30h48" ${s()}/><path d="M26 20c-2-3 2-5 0-8M36 20c-2-3 2-5 0-8" fill="none" ${s('stroke-width="1.8"')}/><circle cx="22" cy="36" r="2" fill="${C.moss}"/><circle cx="38" cy="38" r="2" fill="${C.terra}"/>`,
  plate: `${plate}<path d="M20 38c2-6 10-7 13-2" fill="${C.terra}" ${s('stroke-width="1.8"')}/><path d="M34 38c3-4 9-4 11 0" fill="${C.sage}" ${s('stroke-width="1.8"')}/>`,
  chicken: `${plate}<path d="M18 38c0-8 12-12 20-8 4 2 6 6 4 9-3 4-20 4-24-1z" fill="${C.mustard}" ${s()}/><path d="M40 34l7-6" ${s('stroke-width="3"')}/><circle cx="48" cy="27" r="2.6" fill="${C.white}" ${s('stroke-width="1.6"')}/>`,
  fish: `${plate}<path d="M14 38c6-8 20-8 28 0-8 8-22 8-28 0z" fill="${C.sky}" ${s()}/><path d="M42 38l8-6v12z" fill="${C.sky}" ${s()}/><circle cx="20" cy="37" r="1.4" fill="${L}"/>`,
  egg: `${plate}<path d="M18 38c0-6 6-9 14-9s14 3 14 9-6 7-14 7-14-1-14-7z" fill="${C.white}" ${s()}/><circle cx="32" cy="37" r="5" fill="${C.mustard}" ${s('stroke-width="1.8"')}/>`,
  pasta: `${bowl(C.cream)}<path d="M16 30c4-6 8 2 12-4s8 4 12-2 6 2 8 6" fill="none" ${s('stroke="' + C.mustard + '" stroke-width="3"')}/><path d="M18 30c4-4 8 2 12-2s8 3 12-1" fill="none" ${s('stroke="' + C.mustard + '" stroke-width="3"')}/><circle cx="32" cy="24" r="4" fill="${C.terra}" ${s('stroke-width="1.6"')}/>`,
  pita: `<path d="M10 40c0-14 10-24 22-24s22 10 22 24z" fill="${C.sand}" ${s()}/><path d="M16 38c2-6 6-10 10-12" fill="none" ${s('stroke-width="1.6"')}/>
    <circle cx="26" cy="30" r="4" fill="${C.sage}" ${s('stroke-width="1.4"')}/><circle cx="36" cy="28" r="4" fill="${C.rose}" ${s('stroke-width="1.4"')}/><circle cx="42" cy="34" r="3.5" fill="${C.mustard}" ${s('stroke-width="1.4"')}/><path d="M8 40h48" ${s()}/>`,
  burger: `<path d="M12 30a20 14 0 0 1 40 0z" fill="${C.mustard}" ${s()}/><rect x="10" y="30" width="44" height="5" rx="2.5" fill="${C.sage}" ${s()}/>
    <rect x="12" y="35" width="40" height="7" rx="3.5" fill="${C.choco}" ${s()}/><path d="M12 42h40v2a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6z" fill="${C.mustard}" ${s()}/><path d="M24 22h1M32 20h1M40 23h1" ${s()}/>`,
  pizza: `<path d="M32 10L54 48a26 10 0 0 1-44 0z" fill="${C.mustard}" ${s()}/><path d="M10 48a26 10 0 0 0 44 0" fill="none" ${s('stroke="' + C.clay + '" stroke-width="5"')}/>
    <circle cx="30" cy="30" r="3.5" fill="${C.terra}" ${s('stroke-width="1.4"')}/><circle cx="38" cy="40" r="3.5" fill="${C.terra}" ${s('stroke-width="1.4"')}/><circle cx="24" cy="42" r="3" fill="${C.sage}" ${s('stroke-width="1.4"')}/>`,
  sweet: `<path d="M12 36h40l-4 16H16z" fill="${C.blush}" ${s()}/><path d="M14 36c0-10 8-16 18-16s18 6 18 16z" fill="${C.choco}" ${s()}/><circle cx="32" cy="16" r="4" fill="${C.rose}" ${s()}/><path d="M22 30h2M30 28h2M38 30h2" ${s('stroke="' + C.white + '"')}/>`,
};
