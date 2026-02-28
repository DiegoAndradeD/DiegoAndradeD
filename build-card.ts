import fs from "node:fs";

const TOKEN = process.env.GITHUB_TOKEN || "";
const USERNAME = process.env.GITHUB_ACTOR || "octocat";

interface ContribDay {
  contributionCount: number;
  date: string;
  weekday: number;
}

interface Language {
  name: string;
  color: string;
  percent: number;
}

interface TopRepo {
  name: string;
  description: string;
  stars: number;
  forks: number;
  primaryLanguage: { name: string; color: string } | null;
}

interface Profile {
  name: string;
  login: string;
  avatarUrl: string;
  followers: number;
  totalStars: number;
  totalCommits: number;
  totalRepos: number;
}

interface ContribMatrix {
  totalContributions: number;
  weeks: { days: ContribDay[] }[];
}

async function fetchAll() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        name
        login
        avatarUrl
        followers { totalCount }

        contributionsCollection {
          totalCommitContributions
          restrictedContributionsCount
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
                weekday
              }
            }
          }
        }

        repositories(
          first: 100
          ownerAffiliations: OWNER
          isFork: false
          orderBy: { field: STARGAZERS, direction: DESC }
        ) {
          totalCount
          nodes {
            name
            description
            stargazerCount
            forkCount
            primaryLanguage { name color }
            languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
              edges { size node { name color } }
            }
          }
        }
      }
    }
  `;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });

  const { data, errors } = await res.json();
  if (errors) throw new Error(JSON.stringify(errors, null, 2));
  return data.user;
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mime = res.headers.get("content-type") ?? "image/jpeg";
  return `data:${mime};base64,${base64}`;
}

function processUser(user: any) {
  const profile: Profile = {
    name: user.name || user.login,
    login: `@${user.login}`,
    avatarUrl: user.avatarUrl,
    followers: user.followers.totalCount,
    totalStars: user.repositories.nodes.reduce(
      (s: number, r: any) => s + r.stargazerCount,
      0,
    ),
    totalCommits:
      user.contributionsCollection.totalCommitContributions +
      user.contributionsCollection.restrictedContributionsCount,
    totalRepos: user.repositories.totalCount,
  };

  const matrix: ContribMatrix = {
    totalContributions:
      user.contributionsCollection.contributionCalendar.totalContributions,
    weeks: user.contributionsCollection.contributionCalendar.weeks.map(
      (w: any) => ({
        days: w.contributionDays,
      }),
    ),
  };

  const langMap: Record<string, { size: number; color: string }> = {};
  user.repositories.nodes.forEach((repo: any) => {
    repo.languages.edges.forEach((e: any) => {
      const n = e.node.name;
      if (!langMap[n]) langMap[n] = { size: 0, color: e.node.color ?? "#888" };
      langMap[n].size += e.size;
    });
  });
  const totalSize = Object.values(langMap).reduce((a, b) => a + b.size, 0);
  const languages: Language[] = Object.entries(langMap)
    .sort(([, a], [, b]) => b.size - a.size)
    .slice(0, 4)
    .map(([name, d]) => ({
      name,
      color: d.color,
      percent: parseFloat(((d.size / totalSize) * 100).toFixed(1)),
    }));

  const r0 = user.repositories.nodes[0];
  const topRepo: TopRepo = {
    name: r0?.name ?? "N/A",
    description: r0?.description ?? "",
    stars: r0?.stargazerCount ?? 0,
    forks: r0?.forkCount ?? 0,
    primaryLanguage: r0?.primaryLanguage ?? null,
  };

  return { profile, matrix, languages, topRepo };
}

const X = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const N = (n: number): string =>
  n >= 1_000_000
    ? (n / 1_000_000).toFixed(1) + "M"
    : n >= 1_000
      ? (n / 1_000).toFixed(1) + "k"
      : String(n);

const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&amp;family=JetBrains+Mono:wght@400;500;600&amp;display=swap');

  .fu { opacity:0; animation: fu .65s cubic-bezier(.22,1,.36,1) forwards; }
  .d0 { animation-delay:.05s; } .d1 { animation-delay:.15s; }
  .d2 { animation-delay:.25s; } .d3 { animation-delay:.35s; }
  .d4 { animation-delay:.45s; } .d5 { animation-delay:.55s; }
  .d6 { animation-delay:.65s; } .d7 { animation-delay:.75s; }
  .d8 { animation-delay:.85s; } .d9 { animation-delay:.95s; }
  @keyframes fu {
    from { opacity:0; transform:translateY(12px); }
    to   { opacity:1; transform:translateY(0); }
  }

  .bf { transform-origin:left center; transform:scaleX(0);
        animation: bf 1s cubic-bezier(.22,1,.36,1) forwards; }
  @keyframes bf { to { transform:scaleX(1); } }

  .gp { animation: gp 2.4s ease-in-out infinite alternate; }
  @keyframes gp { from { opacity:.12; } to { opacity:.38; } }

  .rot { animation: rot 8s linear infinite;
         transform-box:fill-box; transform-origin:center; }
  @keyframes rot { to { transform:rotate(360deg); } }

  .sw { animation: sw 3.5s ease-in-out infinite; }
  @keyframes sw {
    0%   { transform:translateX(-110%); }
    100% { transform:translateX(310%);  }
  }

  .dp { animation: dp 2s ease-in-out infinite alternate; }
  @keyframes dp { from { opacity:.4; } to { opacity:1; } }

  .cp { opacity:0; animation: fu .3s ease-out forwards; }
`;

const sharedDefs = (id: string) => `
  <linearGradient id="cyanPurple_${id}" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="#22d3ee"/>
    <stop offset="50%"  stop-color="#a855f7"/>
    <stop offset="100%" stop-color="#ec4899"/>
  </linearGradient>
  <linearGradient id="bgCard_${id}" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%"   stop-color="#09090b"/>
    <stop offset="50%"  stop-color="#18181b"/>
    <stop offset="100%" stop-color="#09090b"/>
  </linearGradient>
  <linearGradient id="glass_${id}" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%"   stop-color="white" stop-opacity="0.05"/>
    <stop offset="100%" stop-color="white" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="sweep_${id}" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="white" stop-opacity="0"/>
    <stop offset="50%"  stop-color="white" stop-opacity="0.08"/>
    <stop offset="100%" stop-color="white" stop-opacity="0"/>
  </linearGradient>
`;

function shell(
  id: string,
  W: number,
  H: number,
  glowColor: string,
  inner: string,
): string {
  return `
  <rect width="${W}" height="${H}" rx="18" fill="url(#bgCard_${id})"/>
  <rect width="${W}" height="${H}" rx="18" fill="url(#glass_${id})"/>
  <rect width="${W}" height="${H}" rx="18" fill="none"
        stroke="${glowColor}" stroke-width="1.5" opacity="0.28" class="gp"/>
  <rect width="${W}" height="${H}" rx="18" fill="none"
        stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  ${inner}
  <clipPath id="cc_${id}"><rect width="${W}" height="${H}" rx="18"/></clipPath>
  <rect clip-path="url(#cc_${id})" x="-${W * 0.35}" y="0"
        width="${W * 0.35}" height="${H}"
        fill="url(#sweep_${id})" class="sw"/>`;
}

function profileCard(p: Profile): string {
  const W = 380,
    H = 330;
  const CX = W / 2,
    CY = 106,
    R = 52;

  const stats = [
    {
      icon: "★",
      color: "#facc15",
      label: "Total Stars",
      value: N(p.totalStars),
    },
    { icon: "⌥", color: "#4ade80", label: "Commits", value: N(p.totalCommits) },
    { icon: "◉", color: "#60a5fa", label: "Followers", value: N(p.followers) },
  ];
  const boxW = 96,
    boxH = 72,
    gap = 14;
  const rowX = (W - (boxW * 3 + gap * 2)) / 2;
  const rowY = 222;

  const boxes = stats
    .map((s, i) => {
      const bx = rowX + i * (boxW + gap);
      return `
    <g class="fu d${5 + i}">
      <rect x="${bx}" y="${rowY}" width="${boxW}" height="${boxH}" rx="12"
            fill="rgba(39,39,42,0.4)" stroke="rgba(63,63,70,0.5)" stroke-width="1"/>
      <text x="${bx + boxW / 2}" y="${rowY + 22}" text-anchor="middle"
            font-family="'Syne',sans-serif" font-size="15" fill="${s.color}">${s.icon}</text>
      <text x="${bx + boxW / 2}" y="${rowY + 46}" text-anchor="middle"
            font-family="'JetBrains Mono',monospace" font-weight="600"
            font-size="18" fill="white">${s.value}</text>
      <text x="${bx + boxW / 2}" y="${rowY + 62}" text-anchor="middle"
            font-family="'JetBrains Mono',monospace" font-size="9"
            fill="#71717a" letter-spacing="1">${s.label.toUpperCase()}</text>
    </g>`;
    })
    .join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
  fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <style>${BASE_CSS}</style>
    ${sharedDefs("prof")}
    <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#22d3ee"/>
      <stop offset="50%"  stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
    <clipPath id="avClip"><circle cx="${CX}" cy="${CY}" r="${R - 5}"/></clipPath>
    <clipPath id="card_prof"><rect width="${W}" height="${H}" rx="18"/></clipPath>
  </defs>

  <g clip-path="url(#card_prof)">
    ${shell(
      "prof",
      W,
      H,
      "#a855f7",
      `
    <!-- blurred glow behind avatar -->
    <circle cx="${CX}" cy="${CY}" r="${R + 12}" fill="#a855f7" opacity="0.12" class="dp"
            style="filter:blur(16px)"/>
    <!-- rotating gradient ring -->
    <circle cx="${CX}" cy="${CY}" r="${R + 3}" fill="none"
            stroke="url(#ring)" stroke-width="3" class="rot"/>
    <!-- avatar -->
    <image href="${p.avatarUrl.replace(/&/g, "&amp;")}" x="${CX - R + 5}" y="${CY - R + 5}"
       width="${(R - 5) * 2}" height="${(R - 5) * 2}"
       clip-path="url(#avClip)" preserveAspectRatio="xMidYMid slice"/>
    <!-- inner dark border -->
    <circle cx="${CX}" cy="${CY}" r="${R - 5}" fill="none"
            stroke="rgba(9,9,11,0.85)" stroke-width="4"/>

    <!-- name -->
    <text x="${CX}" y="${CY + R + 30}" text-anchor="middle"
          font-family="'Syne',sans-serif" font-weight="600"
          font-size="22" fill="white" class="fu d3">${X(p.name)}</text>
    <!-- username -->
    <text x="${CX}" y="${CY + R + 50}" text-anchor="middle"
          font-family="'JetBrains Mono',monospace"
          font-size="13" fill="#71717a" class="fu d4">${X(p.login)}</text>

    ${boxes}
    `,
    )}
  </g>
</svg>`;
}

function languagesCard(langs: Language[], totalRepos: number): string {
  const W = 380;
  const H = 90 + langs.length * 58 + 44;
  const BAR_W = W - 64;

  const bars = langs
    .map((l, i) => {
      const y = 92 + i * 58;
      const fw = (l.percent / 100) * BAR_W;
      return `
    <g class="fu d${2 + i}">
      <text x="32" y="${y + 14}" font-family="'JetBrains Mono',monospace"
            font-size="13" fill="#d4d4d8">${X(l.name)}</text>
      <text x="${W - 32}" y="${y + 14}" text-anchor="end"
            font-family="'JetBrains Mono',monospace" font-weight="600"
            font-size="13" fill="white">${l.percent}%</text>
      <!-- track -->
      <rect x="32" y="${y + 22}" width="${BAR_W}" height="8" rx="4"
            fill="rgba(39,39,42,0.6)"/>
      <!-- glow blur layer -->
      <rect x="32" y="${y + 22}" width="${fw.toFixed(1)}" height="8" rx="4"
            fill="${l.color}" opacity="0.35" class="bf"
            style="filter:blur(4px);animation-delay:${0.3 + i * 0.1}s">
        <animate attributeName="width" from="0" to="${fw.toFixed(1)}"
                 dur=".9s" begin="${0.3 + i * 0.1}s" fill="freeze"
                 calcMode="spline" keySplines=".22 1 .36 1"/>
      </rect>
      <!-- solid fill -->
      <rect x="32" y="${y + 22}" width="${fw.toFixed(1)}" height="8" rx="4"
            fill="${l.color}" opacity="0.9" class="bf"
            style="animation-delay:${0.3 + i * 0.1}s">
        <animate attributeName="width" from="0" to="${fw.toFixed(1)}"
                 dur=".9s" begin="${0.3 + i * 0.1}s" fill="freeze"
                 calcMode="spline" keySplines=".22 1 .36 1"/>
      </rect>
    </g>`;
    })
    .join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
  fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>${BASE_CSS}</style>
    ${sharedDefs("lang")}
    <linearGradient id="iconGrad_lang" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#3b82f6" stop-opacity=".25"/>
      <stop offset="100%" stop-color="#06b6d4" stop-opacity=".25"/>
    </linearGradient>
    <clipPath id="card_lang"><rect width="${W}" height="${H}" rx="18"/></clipPath>
  </defs>

  <g clip-path="url(#card_lang)">
    ${shell(
      "lang",
      W,
      H,
      "#3b82f6",
      `
    <!-- header icon box -->
    <rect x="24" y="24" width="36" height="36" rx="10"
          fill="url(#iconGrad_lang)" stroke="rgba(59,130,246,.3)" stroke-width="1"
          class="fu d0"/>
    <text x="42" y="47" text-anchor="middle"
          font-family="'JetBrains Mono',monospace"
          font-size="14" fill="#22d3ee" class="fu d0">&lt;/&gt;</text>
    <text x="70" y="47" font-family="'Syne',sans-serif" font-weight="600"
          font-size="20" fill="white" class="fu d1">Top Languages</text>
    <!-- divider -->
    <line x1="32" y1="72" x2="${W - 32}" y2="72"
          stroke="rgba(63,63,70,.5)" stroke-width="1" class="fu d1"/>
    ${bars}
    <!-- footer -->
    <text x="${W / 2}" y="${H - 14}" text-anchor="middle"
          font-family="'JetBrains Mono',monospace" font-size="10"
          fill="#52525b" class="fu d9">Based on ${totalRepos} repositories</text>
    `,
    )}
  </g>
</svg>`;
}

function contributionCard(matrix: ContribMatrix): string {
  const CELL = 11;
  const GAP = 3;
  const PAD_X = 24;
  const PAD_T = 88;
  const PAD_B = 44;
  const STEP = CELL + GAP;

  const weeks = matrix.weeks;
  const W = PAD_X * 2 + weeks.length * STEP - GAP;
  const H = PAD_T + 7 * STEP - GAP + PAD_B;

  const levelColor = (lvl: number) =>
    [
      "rgba(39,39,42,0.4)",
      "rgba(6,182,212,0.30)",
      "rgba(6,182,212,0.50)",
      "rgba(6,182,212,0.70)",
      "rgba(6,182,212,0.90)",
    ][Math.min(lvl, 4)];

  const toLevel = (c: number) =>
    c === 0 ? 0 : c <= 2 ? 1 : c <= 5 ? 2 : c <= 9 ? 3 : 4;

  const cells = weeks
    .flatMap((week, wi) =>
      week.days.map((day, di) => {
        const lvl = toLevel(day.contributionCount);
        const cx = PAD_X + wi * STEP;
        const cy = PAD_T + di * STEP;
        const glow =
          lvl > 0
            ? `filter:drop-shadow(0 0 ${2 + lvl}px rgba(6,182,212,${lvl * 0.22}))`
            : "";
        const d = Math.min(Math.floor((wi * 7 + di) / 36), 9);
        return `<rect x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2"
                    fill="${levelColor(lvl)}" style="${glow}" class="cp d${d}"/>`;
      }),
    )
    .join("\n    ");

  const MORE_W = 30;
  const legX = W - PAD_X - MORE_W - 5 * STEP;
  const legY = H - 26;
  const legend = [0, 1, 2, 3, 4]
    .map(
      (l, i) =>
        `<rect x="${legX + i * STEP}" y="${legY}" width="${CELL}" height="${CELL}"
           rx="2" fill="${levelColor(l)}"/>`,
    )
    .join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
  fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>${BASE_CSS}</style>
    ${sharedDefs("ctrb")}
    <linearGradient id="iconGrad_ctrb" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#06b6d4" stop-opacity=".25"/>
      <stop offset="100%" stop-color="#14b8a6" stop-opacity=".25"/>
    </linearGradient>
    <clipPath id="card_ctrb"><rect width="${W}" height="${H}" rx="18"/></clipPath>
  </defs>

  <g clip-path="url(#card_ctrb)">
    ${shell(
      "ctrb",
      W,
      H,
      "#06b6d4",
      `
    <!-- header icon box -->
    <rect x="24" y="22" width="36" height="36" rx="10"
          fill="url(#iconGrad_ctrb)" stroke="rgba(6,182,212,.3)" stroke-width="1"
          class="fu d0"/>
    <!-- activity bar chart icon -->
    <rect x="30" y="45" width="4" height="6"  rx="1" fill="#22d3ee" class="fu d0"/>
    <rect x="36" y="40" width="4" height="11" rx="1" fill="#22d3ee" class="fu d0"/>
    <rect x="42" y="36" width="4" height="15" rx="1" fill="#22d3ee" class="fu d0"/>
    <rect x="48" y="42" width="4" height="9"  rx="1" fill="#22d3ee" class="fu d0"/>

    <text x="70" y="36" font-family="'Syne',sans-serif" font-weight="600"
          font-size="20" fill="white" class="fu d1">Contribution Activity</text>
    <text x="70" y="53" font-family="'JetBrains Mono',monospace" font-size="11"
          fill="#71717a" class="fu d2">${matrix.totalContributions.toLocaleString()} contributions in the last year</text>

    <!-- cells -->
    ${cells}

    <!-- legend -->
    <text x="${PAD_X}" y="${legY + 10}"
          font-family="'JetBrains Mono',monospace" font-size="10"
          fill="#52525b" class="fu d9">Less</text>
    ${legend}
    <text x="${W - PAD_X}" y="${legY + 10}" text-anchor="end"
          font-family="'JetBrains Mono',monospace" font-size="10"
          fill="#52525b" class="fu d9">More</text>
    `,
    )}
  </g>
</svg>`;
}

function spotlightCard(repo: TopRepo): string {
  const W = 720,
    H = 222;

  const starDots = Array.from({ length: 26 }, (_, i) => {
    const x = (((i * 7919 + 1) % 100) / 100) * W;
    const y = (((i * 6271 + 3) % 100) / 100) * H;
    const r = 0.5 + (((i * 4337 + 7) % 4) / 4) * 1.2;
    const op = 0.1 + (((i * 3571 + 11) % 5) / 5) * 0.25;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}"
                    fill="white" opacity="${op.toFixed(2)}"/>`;
  }).join("\n    ");

  const langColor = repo.primaryLanguage?.color ?? "#888";
  const langName = repo.primaryLanguage?.name ?? "Unknown";
  const desc = X(
    repo.description.length > 74
      ? repo.description.slice(0, 74) + "…"
      : repo.description,
  );

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
  fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>${BASE_CSS}
      .al {
        stroke-dasharray: ${W};
        stroke-dashoffset: ${W};
        animation: al 1.2s cubic-bezier(.22,1,.36,1) .4s forwards;
      }
      @keyframes al { to { stroke-dashoffset:0; } }
    </style>
    ${sharedDefs("spot")}
    <linearGradient id="repoName" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#c084fc"/>
      <stop offset="50%"  stop-color="#f472b6"/>
      <stop offset="100%" stop-color="#fb923c"/>
    </linearGradient>
    <linearGradient id="accentL" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#a855f7" stop-opacity="0"/>
      <stop offset="50%"  stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="iconGrad_spot" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#a855f7" stop-opacity=".25"/>
      <stop offset="100%" stop-color="#ec4899" stop-opacity=".25"/>
    </linearGradient>
    <radialGradient id="glow_spot" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#a855f7" stop-opacity=".07"/>
      <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="card_spot"><rect width="${W}" height="${H}" rx="18"/></clipPath>
  </defs>

  <g clip-path="url(#card_spot)">
    ${shell(
      "spot",
      W,
      H,
      "#a855f7",
      `
    <rect width="${W}" height="${H}" fill="url(#glow_spot)"/>
    <!-- star dots -->
    ${starDots}

    <!-- header icon -->
    <rect x="24" y="22" width="34" height="34" rx="9"
          fill="url(#iconGrad_spot)" stroke="rgba(168,85,247,.3)" stroke-width="1"
          class="fu d0"/>
    <text x="41" y="45" text-anchor="middle"
          font-family="'Syne',sans-serif" font-size="16"
          fill="#c084fc" class="fu d0">★</text>

    <text x="68" y="35" font-family="'Syne',sans-serif" font-weight="600"
          font-size="18" fill="white" class="fu d1">Repository Spotlight</text>
    <text x="68" y="51" font-family="'JetBrains Mono',monospace" font-size="10"
          fill="#71717a" letter-spacing="1" class="fu d2">MOST STARRED REPOSITORY</text>

    <!-- repo name -->
    <text x="24" y="104" font-family="'Syne',sans-serif" font-weight="800"
          font-size="32" fill="url(#repoName)" class="fu d3">${X(repo.name)}</text>

    <!-- description -->
    <text x="24" y="128" font-family="'JetBrains Mono',monospace"
          font-size="12" fill="#a1a1aa" class="fu d4">${desc}</text>

    <!-- Stars pill -->
    <rect x="24" y="148" width="108" height="30" rx="10"
          fill="rgba(39,39,42,0.4)" stroke="rgba(63,63,70,.5)" stroke-width="1"
          class="fu d5"/>
    <text x="40" y="168" font-family="'Syne',sans-serif"
          font-size="14" fill="#facc15" class="fu d5">★</text>
    <text x="56" y="168" font-family="'JetBrains Mono',monospace"
          font-weight="700" font-size="15" fill="white" class="fu d5">${N(repo.stars)}</text>
    <text x="80" y="168" font-family="'JetBrains Mono',monospace"
          font-size="10" fill="#71717a" class="fu d5">stars</text>

    <!-- Forks pill -->
    <rect x="142" y="148" width="98" height="30" rx="10"
          fill="rgba(39,39,42,0.4)" stroke="rgba(63,63,70,.5)" stroke-width="1"
          class="fu d6"/>
    <text x="158" y="168" font-family="'JetBrains Mono',monospace"
          font-size="14" fill="#60a5fa" class="fu d6">⑂</text>
    <text x="174" y="168" font-family="'JetBrains Mono',monospace"
          font-weight="700" font-size="15" fill="white" class="fu d6">${N(repo.forks)}</text>
    <text x="198" y="168" font-family="'JetBrains Mono',monospace"
          font-size="10" fill="#71717a" class="fu d6">forks</text>

    <!-- Language pill -->
    <rect x="250" y="148" width="124" height="30" rx="10"
          fill="rgba(39,39,42,0.4)" stroke="rgba(63,63,70,.5)" stroke-width="1"
          class="fu d7"/>
    <circle cx="266" cy="163" r="5" fill="${langColor}" class="fu d7"/>
    <text x="277" y="168" font-family="'JetBrains Mono',monospace"
          font-size="12" fill="#d4d4d8" class="fu d7">${X(langName)}</text>

    <!-- accent line -->
    <line x1="24" y1="${H - 22}" x2="${W - 24}" y2="${H - 22}"
          stroke="url(#accentL)" stroke-width="1.5" class="al"/>
    <line x1="24" y1="${H - 22}" x2="${W - 24}" y2="${H - 22}"
          stroke="#a855f7" stroke-width="4" opacity="0.2"
          style="filter:blur(3px)" class="al"/>
    `,
    )}
  </g>
</svg>`;
}

async function main() {
  console.log("\n  ◈  GitHub SVG Card Generator");
  console.log(`  ·  Fetching data for @${USERNAME}...\n`);

  const user = await fetchAll();
  const { profile, matrix, languages, topRepo } = processUser(user);
  const avatarDataUri = await fetchImageAsBase64(
    "https://images.pexels.com/photos/20737597/pexels-photo-20737597.jpeg",
  );

  console.log(`  ✦  ${profile.name}  (${profile.login})`);
  console.log(`  ✦  Stars     : ${N(profile.totalStars)}`);
  console.log(`  ✦  Commits   : ${N(profile.totalCommits)}`);
  console.log(`  ✦  Followers : ${N(profile.followers)}`);
  console.log(`  ✦  Languages : ${languages.map((l) => l.name).join(", ")}`);
  console.log(`  ✦  Top repo  : ${topRepo.name} (${N(topRepo.stars)} ★)\n`);

  const cards: [string, string][] = [
    ["profile-card.svg", profileCard({ ...profile, avatarUrl: avatarDataUri })],
    ["languages-card.svg", languagesCard(languages, profile.totalRepos)],
    ["contributions-card.svg", contributionCard(matrix)],
    ["spotlight-card.svg", spotlightCard(topRepo)],
  ];

  for (const [name, svg] of cards) {
    fs.writeFileSync(name, svg.trim());
    console.log(`  ✓  ${name}`);
  }

  console.log("\n  ✨  Done! Add to README.md:\n");
  for (const [name] of cards) {
    console.log(
      `     ![](https://raw.githubusercontent.com/${USERNAME}/${USERNAME}/main/${name})`,
    );
  }
  console.log();
}

main().catch((err) => {
  console.error("\n  ✗  Error:", err.message ?? err);
  process.exit(1);
});
