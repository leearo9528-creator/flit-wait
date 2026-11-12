// 데모 행사 배치도 SVG 생성기 — `node scripts/demo-maps.mjs` → public/demo-map-{beer,fair,univ,corp}.svg
// 핀 좌표(x,y %)는 src/lib/demoEvents.ts 의 장소 좌표와 같은 값을 쓴다. 한쪽을 옮기면 다른 쪽도 옮길 것. (겨울 축제 demo-map.svg 는 손으로 그린 것 — 여기서 만들지 않는다)
import { writeFileSync } from 'node:fs'
const C = { red: '#ff8a7a', yel: '#ffc94d', blue: '#5aa9ff', green: '#6dbf8b', vio: '#8f7ae6', gray: '#9aa7b8' }
const P = [C.red, C.yel, C.blue, C.green, C.vio]
const at = (x, y, s, body) => `<g transform="translate(${x * 8} ${y * 10})${s !== 1 ? ` scale(${s})` : ''}">${body}</g>`
const tent = (x, y, c) => at(x, y, 1.15, `<rect x="-24" y="-12" width="48" height="24" rx="3" fill="#fff" stroke="#e5e7eb"/><path d="M-30 -12 L0 -36 L30 -12Z" fill="${c}"/><path d="M-10 -12 L0 -36 L10 -12Z" fill="#fff" opacity=".45"/>`)
const truck = (x, y, c) => at(x, y, 1.05, `<rect x="-30" y="-20" width="60" height="30" rx="6" fill="${c}"/><rect x="-24" y="-14" width="30" height="13" rx="3" fill="#fff"/><rect x="12" y="-14" width="13" height="11" rx="3" fill="#dff1ff"/><circle cx="-16" cy="11" r="5" fill="#4b5563"/><circle cx="16" cy="11" r="5" fill="#4b5563"/>`)
const stall = (x, y, c) => at(x, y, 1.5, `<rect x="-18" y="-6" width="36" height="16" rx="2" fill="#fff" stroke="#e5e7eb"/><path d="M-21 -6 h42 l-4 -11 h-34Z" fill="${c}"/><path d="M-13 -6 l2 -11 M-4 -6 l1 -11 M5 -6 l-1 -11 M14 -6 l-2 -11" stroke="#fff" stroke-width="3"/>`)
const shell = (x, y, c) => at(x, y, 1, `<rect x="-24" y="-24" width="48" height="48" rx="4" fill="#fff" stroke="#d1d5db" stroke-width="2"/><rect x="-24" y="-24" width="48" height="12" rx="4" fill="${c}"/><rect x="-14" y="-2" width="28" height="14" rx="2" fill="#f3f4f6"/>`)
const house = (x, y, c) => at(x, y, 1, `<rect x="-20" y="-14" width="40" height="26" rx="3" fill="#fff" stroke="#dbe3ee" stroke-width="2"/><path d="M-25 -14 L0 -32 L25 -14Z" fill="${c}"/><rect x="-5" y="-2" width="10" height="14" rx="2" fill="#dbe3ee"/>`)
const stage = (x, y, c, w = 150) => at(x, y, 1, `<rect x="${-w / 2}" y="-34" width="${w}" height="68" rx="14" fill="#f1ecff" stroke="#d9cffb" stroke-width="2"/><rect x="${-w / 2 + 14}" y="6" width="${w - 28}" height="16" rx="4" fill="${c}"/><path d="M${-w / 2 + 14} 6 V-10 Q0 -40 ${w / 2 - 14} -10 V6" fill="none" stroke="${c}" stroke-width="6"/><circle cx="-20" cy="-6" r="4" fill="${C.yel}"/><circle cx="0" cy="-12" r="4" fill="${C.red}"/><circle cx="20" cy="-6" r="4" fill="${C.blue}"/>`)
const tree = (x, y, s = 1) => at(x, y, s, `<rect x="-3" y="14" width="6" height="10" rx="2" fill="#b08968"/><path d="M0-26 L15 -4 H-15Z" fill="#6dbf8b"/><path d="M0-14 L19 12 H-19Z" fill="#57b07a"/>`)
const table = (x, y) => at(x, y, 1, `<circle r="13" fill="#fff" stroke="#e7dcc8" stroke-width="2"/><circle cx="-19" r="5" fill="#e7dcc8"/><circle cx="19" r="5" fill="#e7dcc8"/>`)
const mat = (x, y, c) => at(x, y, 1, `<rect x="-22" y="-14" width="44" height="28" rx="5" fill="${c}" opacity=".55"/>`)
const car = (x, y, c) => at(x, y, 1, `<rect x="-13" y="-22" width="26" height="44" rx="8" fill="${c}"/><rect x="-9" y="-12" width="18" height="12" rx="3" fill="#eaf6ff"/><rect x="-9" y="6" width="18" height="8" rx="3" fill="#eaf6ff"/>`)
const bus = (x, y) => at(x, y, 1, `<rect x="-34" y="-14" width="68" height="28" rx="8" fill="${C.blue}"/><rect x="-28" y="-9" width="56" height="10" rx="3" fill="#eaf6ff"/><circle cx="-18" cy="15" r="5" fill="#4b5563"/><circle cx="18" cy="15" r="5" fill="#4b5563"/>`)
const zone = (x, y, w, h, fill, stroke, rx = 24) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
const label = (px, py, t) => { const w = t.length * 17 + 24; return `<g><rect x="${px - w / 2}" y="${py - 14}" width="${w}" height="27" rx="13.5" fill="#fff" opacity=".92"/><text x="${px}" y="${py + 5}" text-anchor="middle" font-size="17" font-weight="700" fill="#374151">${t}</text></g>` }
const tag = (x, y, t, c = C.blue) => { const w = t.length * 16 + 34, px = x * 8, py = y * 10; return `<g><rect x="${px - w / 2}" y="${py - 14}" width="${w}" height="27" rx="13.5" fill="#fff" stroke="${c}" stroke-width="2"/><circle cx="${px - w / 2 + 15}" cy="${py - 0.5}" r="5" fill="${c}"/><text x="${px + 8}" y="${py + 5}" text-anchor="middle" font-size="16" font-weight="700" fill="#374151">${t}</text></g>` }
const road = (d, w = 46, edge = '#e9e4d8', fill = '#fffdf8') => `<path d="${d}" fill="none" stroke="${edge}" stroke-width="${w + 8}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
const gate = (c, t = '입구') => `<g><path d="M340 992 V942 Q400 887 460 942 V992" fill="none" stroke="${c}" stroke-width="14" stroke-linecap="round"/><path d="M340 992 V942 Q400 887 460 942 V992" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="2 14" stroke-linecap="round"/><rect x="${400 - (t.length * 15 + 20) / 2}" y="950" width="${t.length * 15 + 20}" height="24" rx="12" fill="#fff"/><text x="400" y="967" text-anchor="middle" font-size="15" font-weight="700" fill="#374151">${t}</text></g>`
const svg = (bg, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000" font-family="Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif">\n<rect width="800" height="1000" fill="${bg}"/>\n${body.join('\n')}\n</svg>\n`
const trees = pts => pts.map(([x, y, s]) => tree(x, y, s ?? 1)).join('')

// ── 맥주축제 (실외) ──
const beer = svg('#fffaf0', [
  `<g fill="#fff3d6"><ellipse cx="90" cy="300" rx="130" ry="70"/><ellipse cx="720" cy="290" rx="120" ry="70"/><ellipse cx="400" cy="880" rx="300" ry="60"/></g>`,
  road('M400 1000 V780 M400 780 H160 V440 M400 780 H640 V440 M160 440 H640 M400 440 V330 M160 330 H640'),
  zone(180, 50, 440, 150, '#f6f0ff', '#dccffb', 30), stage(50, 12.5, C.vio, 200),
  zone(150, 215, 500, 150, '#fff7e0', '#ffe3a1'),
  ...[[26, 26], [38, 26], [50, 26], [62, 26], [74, 26], [32, 32], [44, 32], [56, 32], [68, 32]].map(([x, y]) => table(x, y)),
  zone(40, 400, 240, 280, '#fff1cc', '#ffd980'), tent(12, 47, C.yel), tent(27, 47, C.red), tent(12, 60, C.blue), tent(25, 57, C.green),
  zone(300, 410, 200, 270, '#eaf6ff', '#bfe0ff'), tent(42, 46, C.vio), tent(58, 51, C.green), tent(52, 65, C.red),
  zone(520, 400, 240, 280, '#ffe9e6', '#ffc9c2'), truck(72, 47, C.red), truck(88, 47, C.blue), truck(72, 60, C.yel), truck(88, 60, C.green),
  stall(22, 80, C.vio), tent(40, 84.5, C.blue), house(60, 84.5, C.green), house(78, 84.5, C.red), bus(80, 94.5),
  trees([[4, 38, 1.1], [96, 38, 1], [4, 90, 1.1], [10, 94, .8], [96, 88, 1], [36, 94, .8], [64, 94.5, .8], [5, 12, 1], [12, 16, .8], [94, 12, 1], [88, 17, .8]]),
  gate(C.yel),
  label(400, 62, '메인 무대'), label(400, 236, '테이블 존'), label(160, 420, '브루어리 존'), label(400, 430, '체험 존'), label(640, 420, '푸드트럭 존'),
  tag(8, 74, '화장실'), tag(92, 74, '화장실'),
])

// ── 실내 페어 ──
const cols = [20, 40, 60, 80], rows = [30, 44, 58]
const fair = svg('#eef0f4', [
  `<rect x="30" y="30" width="740" height="930" rx="18" fill="#fbfbfa" stroke="#c9ced8" stroke-width="6"/>`,
  `<rect x="340" y="954" width="120" height="12" fill="#fbfbfa"/>`,
  `<g stroke="#eceef2" stroke-width="30" stroke-linecap="round">${[240, 400, 560].map(x => `<path d="M${x} 250 V630"/>`).join('')}<path d="M70 230 H730"/><path d="M70 640 H730"/><path d="M70 822 H730"/><path d="M400 822 V950"/></g>`,
  zone(60, 60, 300, 130, '#fff3e3', '#ffd9a8', 16), shell(16, 12.5, C.yel), shell(30, 12.5, C.red), table(8, 17), table(23, 17.5), table(38, 17),
  zone(430, 60, 310, 130, '#f1ecff', '#d9cffb', 16), stage(72, 12.5, C.vio, 170),
  ...rows.flatMap((y, r) => cols.map((x, c) => `<rect x="${x * 8 - 44}" y="${y * 10 - 40}" width="88" height="80" rx="10" fill="${['#eef6ff', '#fff4f2', '#f3fbf5'][r]}"/>` + shell(x, y, P[(r * 4 + c) % 5]))),
  zone(90, 664, 290, 136, '#fff9e3', '#ffe9a8', 16), shell(21, 70.5, C.yel), shell(37, 76, C.green),
  zone(400, 664, 310, 136, '#eaf6ff', '#bfe0ff', 16), shell(54, 70.5, C.blue), shell(67, 76, C.red), shell(80, 70.5, C.vio),
  house(38, 87, C.blue), house(62, 87, C.gray),
  `<rect x="340" y="962" width="120" height="26" rx="13" fill="#374151"/><text x="400" y="981" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">입구</text>`,
  label(130, 78, '카페 라운지'), label(510, 78, '메인 무대'), label(400, 250, '셀러 부스 A · B · C'), label(300, 782, '클래스 존'), label(640, 782, '체험 존'),
  tag(10, 88, '수유실', C.red), tag(90, 88, '화장실'),
])

// ── 대학 축제 ──
const univ = svg('#f4fbef', [
  `<g fill="#e3f4d7"><ellipse cx="400" cy="500" rx="150" ry="120"/><ellipse cx="90" cy="880" rx="130" ry="60"/><ellipse cx="710" cy="880" rx="130" ry="60"/></g>`,
  road('M400 1000 V800 M400 800 H150 V330 M400 800 H650 V330 M150 330 H650 M400 330 V200'),
  `<path d="M180 190 Q400 20 620 190 Z" fill="#f1ecff" stroke="#d9cffb" stroke-width="2"/><path d="M230 180 Q400 60 570 180" fill="none" stroke="#e2d9fb" stroke-width="10"/><path d="M270 185 Q400 100 530 185" fill="none" stroke="#e2d9fb" stroke-width="10"/>`,
  stage(50, 11.5, C.vio, 150), tent(34, 24.5, C.blue),
  zone(40, 345, 80, 320, '#fff1cc', '#ffd980', 20), tent(12, 39, C.red), tent(12, 51, C.yel), tent(12, 63, C.green),
  zone(170, 400, 80, 230, '#fff9e3', '#ffe9a8', 20), stall(26, 45, C.vio), stall(26, 59, C.blue),
  zone(280, 370, 240, 250, '#eaf6ff', '#bfe0ff'), tent(40, 41, C.vio), tent(60, 46, C.red), tent(40, 55, C.green), tent(60, 60, C.yel),
  zone(560, 400, 80, 230, '#ffe9e6', '#ffc9c2', 20), zone(680, 345, 80, 320, '#ffe9e6', '#ffc9c2', 20),
  truck(74, 51, C.yel), truck(88, 39, C.red), truck(88, 51, C.blue), truck(88, 63, C.green),
  at(50, 70, 1, `<rect x="-34" y="-16" width="68" height="32" rx="8" fill="#fff" stroke="${C.red}" stroke-width="3"/><circle r="8" fill="${C.red}"/>`),
  house(38, 85.5, C.blue), house(62, 85.5, C.red), bus(82, 94.5),
  trees([[4, 28, 1.1], [96, 28, 1.1], [4, 72, 1], [96, 72, 1], [5, 94, 1], [14, 96, .8], [30, 93, .9], [68, 93, .9], [22, 28, .8], [78, 28, .8], [8, 8, 1], [92, 8, 1], [16, 14, .8], [84, 14, .8]]),
  gate(C.blue, '정문'),
  label(400, 40, '노천극장'), label(80, 330, '학과 부스'), label(210, 386, '플리마켓'), label(400, 356, '잔디광장 체험'), label(660, 330, '푸드트럭'), label(400, 742, '포토존'),
  tag(8, 77, '화장실'), tag(92, 77, '화장실'),
])

// ── 기업 행사 (패밀리데이) ──
const corp = svg('#f6fbff', [
  `<g fill="#e6f5e1"><ellipse cx="400" cy="420" rx="130" ry="120"/></g><g fill="#eaf2fb"><ellipse cx="700" cy="880" rx="140" ry="60"/></g>`,
  road('M400 1000 V770 M120 770 H680 M120 770 V300 M680 770 V300 M120 300 H680 M400 300 V200', 44, '#e2eaf3'),
  zone(220, 50, 360, 140, '#f1ecff', '#d9cffb', 30), stage(50, 12, C.blue, 180),
  mat(42, 36, C.yel), mat(54, 38, C.red), mat(46, 45, C.blue), mat(57, 47, C.green), mat(48, 53, C.vio),
  zone(40, 285, 250, 250, '#fff9e3', '#ffe9a8'),
  at(16, 34, 1, `<rect x="-40" y="-18" width="80" height="34" rx="12" fill="${C.yel}"/><circle cx="-22" cy="-22" r="13" fill="${C.red}"/><circle cx="22" cy="-22" r="13" fill="${C.blue}"/><rect x="-10" y="-34" width="20" height="24" rx="8" fill="${C.green}"/>`),
  at(16, 48, 1, `<rect x="-36" y="-12" width="30" height="22" rx="5" fill="${C.red}"/><rect x="-2" y="-8" width="24" height="18" rx="4" fill="${C.blue}"/><rect x="26" y="-8" width="24" height="18" rx="4" fill="${C.green}"/><g fill="#4b5563"><circle cx="-28" cy="12" r="4"/><circle cx="-12" cy="12" r="4"/><circle cx="10" cy="12" r="4"/><circle cx="38" cy="12" r="4"/></g>`),
  tent(30, 41, C.vio),
  zone(510, 285, 250, 250, '#eaf6ff', '#bfe0ff'), tent(84, 35, C.red), tent(84, 49, C.green), tent(70, 41, C.yel),
  zone(170, 590, 460, 120, '#ffe9e6', '#ffc9c2'), stall(30, 65, C.red), stall(44, 65, C.yel), stall(58, 65, C.blue), stall(72, 65, C.green),
  tent(36, 85.5, C.blue), house(64, 85.5, C.green), house(78, 80.5, C.red),
  zone(30, 845, 220, 110, '#eef2f7', '#dbe3ee', 22), car(8, 90, C.blue), car(14, 90, C.red), car(20, 90, C.gray), car(26, 90, C.yel), bus(84, 94.5),
  trees([[4, 22, 1.1], [96, 22, 1.1], [4, 62, 1], [96, 62, 1], [12, 76, .8], [88, 70, .8], [8, 8, 1], [92, 8, 1], [18, 14, .8], [82, 14, .8], [58, 94, .9], [68, 95, .8]]),
  gate(C.green),
  label(400, 62, '메인 무대'), label(165, 300, '키즈 존'), label(635, 300, '체험 존'), label(400, 420, '피크닉 잔디'), label(400, 604, '케이터링 존'), label(140, 930, '주차장'),
  tag(92, 70, '화장실'),
])

for (const [k, s] of Object.entries({ beer, fair, univ, corp })) { writeFileSync(new URL(`../public/demo-map-${k}.svg`, import.meta.url), s); console.log(k, s.length) }
