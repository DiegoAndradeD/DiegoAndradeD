/**
 * Generates the SVG cards used by README.md, in a light and a dark variant each
 * (contributions-card-{light,dark}.svg, languages-card-{light,dark}.svg). The README chooses one
 * with <picture>. Runs daily in .github/workflows/update-card.yml.
 *
 *   node build-card.ts                      needs GITHUB_TOKEN and GITHUB_ACTOR (set by the Action)
 *   DEMO=1 OUT=preview node build-card.ts   fake data, no network: to look at the design
 *   STATIC=1 ...                            also disables the entrance animation (for rasterizers)
 *
 * Design: GitHub's own neutral surfaces, one muted steel-blue ramp, system fonts only (an SVG shown
 * through <img> cannot load web fonts), a short fade-in and nothing that loops.
 */
import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.GITHUB_TOKEN || "";
const USERNAME = process.env.GITHUB_ACTOR || "octocat";
const ORG = "ordreth";
const DEMO = process.env.DEMO === "1";
const STATIC = process.env.STATIC === "1";
const OUT = process.env.OUT || ".";

/** Languages that say nothing about what I build. */
const EXCLUDE_LANGS = new Set([
  "HTML",
  "CSS",
  "SCSS",
  "Less",
  "Roff",
  "Handlebars",
  "Makefile",
  "Dockerfile",
  "Batchfile",
  "Jinja",
]);
const MAX_LANGS = 5;

interface Theme {
  surface: string;
  line: string;
  text: string;
  muted: string;
  dim: string;
  cellEmpty: string;
  ramp: [string, string, string, string]; // contribution levels 1 to 4
}

const THEMES: Record<"dark" | "light", Theme> = {
  dark: {
    surface: "#161b22",
    line: "#30363d",
    text: "#e6edf3",
    muted: "#8b949e",
    dim: "#6e7681",
    cellEmpty: "#21262d",
    ramp: ["#25465f", "#34668c", "#4a86b6", "#6ba7d4"],
  },
  light: {
    surface: "#f6f8fa",
    line: "#d0d7de",
    text: "#1f2328",
    muted: "#656d76",
    dim: "#8c959f",
    cellEmpty: "#e4e8ec",
    ramp: ["#c6dbee", "#97bddf", "#5d99ca", "#2d70aa"],
  },
};

const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`;
const CARD_W = 787;

interface ContribDay {
  contributionCount: number;
  date: string;
  weekday: number;
}
interface ContribMatrix {
  totalContributions: number;
  weeks: { days: ContribDay[] }[];
}
interface Language {
  name: string;
  color: string;
  percent: number;
}
interface LanguageStats {
  languages: Language[];
  totalRepos: number;
}

// ---------------------------------------------------------------------------------------------
// Data

const USER_QUERY = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { contributionCount date weekday } }
        }
      }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
        totalCount
        nodes { languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } } }
      }
    }
  }
`;

const ORG_QUERY = `
  query($org: String!) {
    organization(login: $org) {
      repositories(first: 100, isFork: false, privacy: PUBLIC) {
        totalCount
        nodes { languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } } }
      }
    }
  }
`;

async function graphql(query: string, variables: Record<string, string>) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors, null, 2));
  return body.data;
}

function languageStats(repoSets: { totalCount: number; nodes: any[] }[]): LanguageStats {
  const map: Record<string, { size: number; color: string }> = {};
  let totalRepos = 0;
  for (const set of repoSets) {
    totalRepos += set.totalCount;
    for (const repo of set.nodes) {
      for (const e of repo.languages.edges) {
        const n = e.node.name;
        if (EXCLUDE_LANGS.has(n)) continue;
        if (!map[n]) map[n] = { size: 0, color: e.node.color ?? "#888888" };
        map[n].size += e.size;
      }
    }
  }
  const top = Object.entries(map)
    .sort(([, a], [, b]) => b.size - a.size)
    .slice(0, MAX_LANGS)
    .map(([name, d]) => ({ name, color: d.color, size: d.size }));
  const shown = top.reduce((a, b) => a + b.size, 0) || 1;
  // percentages are relative to what is shown, so the bar is always full
  return {
    totalRepos,
    languages: top.map((l) => ({
      name: l.name,
      color: l.color,
      percent: parseFloat(((l.size / shown) * 100).toFixed(1)),
    })),
  };
}

async function loadData(): Promise<{ matrix: ContribMatrix; stats: LanguageStats }> {
  if (DEMO) return demoData();

  const { user } = await graphql(USER_QUERY, { login: USERNAME });
  const calendar = user.contributionsCollection.contributionCalendar;
  const matrix: ContribMatrix = {
    totalContributions: calendar.totalContributions,
    weeks: calendar.weeks.map((w: any) => ({ days: w.contributionDays })),
  };

  const sets = [user.repositories];
  try {
    const { organization } = await graphql(ORG_QUERY, { org: ORG });
    if (organization) sets.push(organization.repositories);
  } catch (err: any) {
    console.warn(`  !  organisation ${ORG} skipped: ${err.message ?? err}`);
  }
  return { matrix, stats: languageStats(sets) };
}

function demoData() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const start = new Date(Date.UTC(2025, 10, 23));
  const weeks: ContribMatrix["weeks"] = [];
  let total = 0;
  for (let w = 0; w < 53; w++) {
    const days: ContribDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime() + (w * 7 + d) * 86400000);
      const busy = Math.sin(w / 5) + rnd() > 0.7;
      const c = busy ? Math.floor(rnd() * 12) : 0;
      total += c;
      days.push({ contributionCount: c, date: date.toISOString().slice(0, 10), weekday: d });
    }
    weeks.push({ days });
  }
  return {
    matrix: { totalContributions: total, weeks },
    stats: {
      totalRepos: 21,
      languages: [
        { name: "TypeScript", color: "#3178c6", percent: 41.2 },
        { name: "Rust", color: "#dea584", percent: 27.9 },
        { name: "Go", color: "#00add8", percent: 14.3 },
        { name: "Java", color: "#b07219", percent: 9.6 },
        { name: "Nix", color: "#7e7eff", percent: 7.0 },
      ],
    },
  };
}

// ---------------------------------------------------------------------------------------------
// SVG helpers

const X = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const CSS = `
  .fu { opacity:0; animation: fu .6s cubic-bezier(.22,1,.36,1) forwards; }
  .d0 { animation-delay:.05s } .d1 { animation-delay:.12s } .d2 { animation-delay:.19s }
  .d3 { animation-delay:.26s } .d4 { animation-delay:.33s } .d5 { animation-delay:.40s }
  .d6 { animation-delay:.47s } .d7 { animation-delay:.54s } .d8 { animation-delay:.61s }
  .d9 { animation-delay:.68s }
  @keyframes fu { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
  .bar { transform-box:fill-box; transform-origin:left center; transform:scaleX(0);
         animation: bar .9s cubic-bezier(.22,1,.36,1) .15s forwards; }
  @keyframes bar { to { transform:scaleX(1) } }
  @media (prefers-reduced-motion: reduce) {
    .fu, .bar { animation:none; opacity:1; transform:none }
  }
  ${STATIC ? ".fu { opacity:1; animation:none } .bar { transform:none; animation:none }" : ""}
`;

function frame(id: string, t: Theme, W: number, H: number, inner: string): string {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none"
  xmlns="http://www.w3.org/2000/svg" role="img">
  <defs>
    <style>${CSS}</style>
    <clipPath id="clip_${id}"><rect width="${W}" height="${H}" rx="10"/></clipPath>
  </defs>
  <g clip-path="url(#clip_${id})">
    <rect width="${W}" height="${H}" fill="${t.surface}"/>
    ${inner}
  </g>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="9.5" stroke="${t.line}"/>
</svg>
`;
}

const title = (t: Theme, text: string, sub: string) => `
    <text x="28" y="40" font-family="${SANS}" font-weight="600" font-size="16" fill="${t.text}"
          class="fu d0">${X(text)}</text>
    <text x="${CARD_W - 28}" y="40" text-anchor="end" font-family="${MONO}" font-size="11"
          fill="${t.dim}" class="fu d1">${X(sub)}</text>`;

// ---------------------------------------------------------------------------------------------
// Cards

function contributionCard(t: Theme, matrix: ContribMatrix): string {
  const PAD_X = 28;
  const PAD_T = 84;
  const PAD_B = 46;
  const GAP = 3;
  const weeks = matrix.weeks;
  const STEP = (CARD_W - PAD_X * 2 + GAP) / weeks.length;
  const CELL = STEP - GAP;
  const H = Math.round(PAD_T + 7 * STEP - GAP + PAD_B);

  const levelFill = (c: number): string => {
    if (c === 0) return `fill="${t.cellEmpty}"`;
    const lvl = c <= 2 ? 0 : c <= 5 ? 1 : c <= 9 ? 2 : 3;
    return `fill="${t.ramp[lvl]}"`;
  };

  const cells = weeks
    .flatMap((week, wi) =>
      week.days.map((day, di) => {
        const d = Math.min(Math.floor((wi * 7 + di) / 40), 9);
        return `<rect x="${(PAD_X + wi * STEP).toFixed(2)}" y="${(PAD_T + di * STEP).toFixed(2)}"
          width="${CELL.toFixed(2)}" height="${CELL.toFixed(2)}" rx="2.5"
          ${levelFill(day.contributionCount)} class="fu d${d}"/>`;
      }),
    )
    .join("");

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let lastMonth = -1;
  let lastX = -100;
  const months = weeks
    .map((w, wi) => {
      const m = parseInt(w.days[0].date.slice(5, 7), 10) - 1;
      const x = PAD_X + wi * STEP;
      if (m === lastMonth || x - lastX < 34) return "";
      lastMonth = m;
      lastX = x;
      return `<text x="${x.toFixed(1)}" y="${PAD_T - 10}" font-family="${MONO}" font-size="10"
          fill="${t.dim}" class="fu d3">${MONTHS[m]}</text>`;
    })
    .join("");

  const legY = H - 28;
  const legX = CARD_W - PAD_X - 38 - 5 * 15;
  const legend = [0, 1, 4, 7, 12]
    .map((c, i) => `<rect x="${legX + i * 15}" y="${legY}" width="11" height="11" rx="2.5" ${levelFill(c)}/>`)
    .join("");

  return frame(
    "ctrb",
    t,
    CARD_W,
    H,
    `
    ${title(t, "Contribution activity", `${matrix.totalContributions.toLocaleString("en-US")} in the last year`)}
    ${months}
    ${cells}
    <text x="${PAD_X}" y="${legY + 9}" font-family="${MONO}" font-size="10" fill="${t.dim}"
          class="fu d9">Public and private contributions linked to this account</text>
    <text x="${legX - 8}" y="${legY + 9}" text-anchor="end" font-family="${MONO}" font-size="10"
          fill="${t.dim}" class="fu d9">Less</text>
    ${legend}
    <text x="${CARD_W - PAD_X}" y="${legY + 9}" text-anchor="end" font-family="${MONO}" font-size="10"
          fill="${t.dim}" class="fu d9">More</text>`,
  );
}

function languagesCard(t: Theme, { languages, totalRepos }: LanguageStats): string {
  const H = 168;
  const PAD = 28;
  const BAR_W = CARD_W - PAD * 2;
  const GAP = 3;

  let x = PAD;
  const segs = languages
    .map((l) => {
      const w = Math.max((l.percent / 100) * BAR_W - GAP, 2);
      const seg = `<rect x="${x.toFixed(1)}" y="64" width="${w.toFixed(1)}" height="9" rx="2" fill="${l.color}" opacity=".9"/>`;
      x += w + GAP;
      return seg;
    })
    .join("");

  const colW = BAR_W / Math.max(languages.length, 1);
  const legend = languages
    .map((l, i) => {
      const cx = PAD + i * colW;
      return `
    <g class="fu d${3 + i}">
      <circle cx="${cx + 4}" cy="108" r="4" fill="${l.color}"/>
      <text x="${cx + 16}" y="112" font-family="${MONO}" font-size="12" fill="${t.muted}">${X(l.name)}</text>
      <text x="${cx}" y="140" font-family="${SANS}" font-weight="600" font-size="20" fill="${t.text}">${l.percent.toFixed(1)}<tspan font-size="12" fill="${t.dim}" dx="2">%</tspan></text>
    </g>`;
    })
    .join("");

  return frame(
    "lang",
    t,
    CARD_W,
    H,
    `
    ${title(t, "Languages", `${totalRepos} public repositories · personal and Ordreth`)}
    <clipPath id="barclip"><rect x="${PAD}" y="64" width="${BAR_W}" height="9" rx="4.5"/></clipPath>
    <g clip-path="url(#barclip)"><g class="bar">${segs}</g></g>
    ${legend}`,
  );
}

// ---------------------------------------------------------------------------------------------

async function main() {
  console.log(`\n  ·  Generating cards${DEMO ? " (demo data)" : ` for @${USERNAME} + ${ORG}`}\n`);
  const { matrix, stats } = await loadData();

  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, theme] of Object.entries(THEMES)) {
    const cards: [string, string][] = [
      [`contributions-card-${name}.svg`, contributionCard(theme, matrix)],
      [`languages-card-${name}.svg`, languagesCard(theme, stats)],
    ];
    for (const [file, svg] of cards) {
      fs.writeFileSync(path.join(OUT, file), svg.trim() + "\n");
      console.log(`  ✓  ${file}`);
    }
  }
  console.log(`  ·  Languages: ${stats.languages.map((l) => `${l.name} ${l.percent}%`).join(", ")}\n`);
}

main().catch((err) => {
  console.error("\n  ✗  Error:", err.message ?? err);
  process.exit(1);
});
