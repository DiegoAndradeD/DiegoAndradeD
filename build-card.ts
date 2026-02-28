import fs from 'node:fs';

const TOKEN = process.env.GITHUB_TOKEN || '';
const USERNAME = process.env.GITHUB_ACTOR || '';

async function fetchGitHubData() {
  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar { totalContributions }
        }
        pullRequests(first: 1) { totalCount }
        issues(first: 1) { totalCount }
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: STARGAZERS, direction: DESC}) {
          nodes {
            stargazers { totalCount }
            languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node { name color }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { username: USERNAME } })
  });

  const { data } = await response.json();
  return data.user;
}

function processData(user: any) {
  const stats = {
    commits: user.contributionsCollection.contributionCalendar.totalContributions,
    prs: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    stars: 0,
    languages: {} as Record<string, { size: number; color: string }>,
  };

  user.repositories.nodes.forEach((repo: any) => {
    stats.stars += repo.stargazers.totalCount;
    repo.languages.edges.forEach((lang: any) => {
      const name = lang.node.name;
      if (!stats.languages[name]) {
        stats.languages[name] = { size: 0, color: lang.node.color };
      }
      stats.languages[name].size += lang.size;
    });
  });

  // Calcula porcentagens das linguagens
  const totalSize = Object.values(stats.languages).reduce((acc, curr) => acc + curr.size, 0);
  const topLanguages = Object.entries(stats.languages)
    .sort(([, a], [, b]) => b.size - a.size)
    .slice(0, 5) // Pega as 5 principais
    .map(([name, data]) => ({
      name,
      color: data.color,
      percent: ((data.size / totalSize) * 100).toFixed(1)
    }));

  return { stats, topLanguages };
}

// Estilos base compartilhados (Design minimalista, "Void" metálico, tipografia focada)
const SHARED_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&amp;display=swap');
  
  .bg { fill: #0a0b0f; stroke: #2d3139; stroke-width: 1.5; rx: 12px; }
  .title { font-family: 'Inter', sans-serif; font-weight: 700; fill: #e2e8f0; font-size: 18px; }
  .subtitle { font-family: 'Inter', sans-serif; font-weight: 400; fill: #8b949e; font-size: 13px; }
  .stat-value { font-family: 'Inter', sans-serif; font-weight: 700; fill: #ffffff; font-size: 20px; }
  .stat-label { font-family: 'Inter', sans-serif; font-weight: 600; fill: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  
  /* Animações fluidas */
  .stagger { opacity: 0; animation: fadeIn 0.8s ease-out forwards; }
  .delay-1 { animation-delay: 0.2s; }
  .delay-2 { animation-delay: 0.4s; }
  .delay-3 { animation-delay: 0.6s; }
  .delay-4 { animation-delay: 0.8s; }
  
  @keyframes fadeIn {
    0% { opacity: 0; transform: translateY(10px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideRight {
    0% { width: 0; }
    100% { opacity: 1; }
  }
`;

function generateStatsCard(stats: any) {
  return `
  <svg width="450" height="180" viewBox="0 0 450 180" fill="none" xmlns="http://www.w3.org/2000/svg">
    <style>${SHARED_STYLES}</style>
    <rect width="100%" height="100%" class="bg" />
    
    <text x="30" y="40" class="title stagger">Métricas de Desenvolvimento</text>
    <text x="30" y="60" class="subtitle stagger delay-1">Visão geral das contribuições de ${USERNAME}</text>

    <g transform="translate(30, 100)">
      <text y="0" class="stat-value stagger delay-2">${stats.commits}</text>
      <text y="20" class="stat-label stagger delay-2">Commits</text>
    </g>
    <g transform="translate(130, 100)">
      <text y="0" class="stat-value stagger delay-3">${stats.stars}</text>
      <text y="20" class="stat-label stagger delay-3">Estrelas</text>
    </g>
    <g transform="translate(230, 100)">
      <text y="0" class="stat-value stagger delay-4">${stats.prs}</text>
      <text y="20" class="stat-label stagger delay-4">Pull Requests</text>
    </g>
    <g transform="translate(350, 100)">
      <text y="0" class="stat-value stagger delay-4">${stats.issues}</text>
      <text y="20" class="stat-label stagger delay-4">Issues</text>
    </g>
  </svg>
  `;
}

function generateLangCard(languages: any[]) {
  let langBars = '';
  let yPos = 90;
  let delay = 2;

  languages.forEach((lang) => {
    langBars += `
      <g transform="translate(30, ${yPos})" class="stagger delay-${delay}">
        <text x="0" y="10" class="stat-label" style="text-transform: none; fill: #e2e8f0;">${lang.name}</text>
        <text x="380" y="10" class="stat-label" style="text-transform: none;" text-anchor="end">${lang.percent}%</text>
        
        <rect x="0" y="20" width="380" height="8" fill="#1e232b" rx="4" />
        <rect x="0" y="20" width="0" height="8" fill="${lang.color}" rx="4">
          <animate attributeName="width" from="0" to="${(lang.percent / 100) * 380}" dur="1s" begin="0.${delay}s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
        </rect>
      </g>
    `;
    yPos += 45;
    delay++;
  });

  // Ajusta a altura do card baseado na quantidade de linguagens
  const height = 90 + (languages.length * 45) + 10;

  return `
  <svg width="450" height="${height}" viewBox="0 0 450 ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <style>${SHARED_STYLES}</style>
    <rect width="100%" height="100%" class="bg" />
    
    <text x="30" y="40" class="title stagger">Linguagens Mais Utilizadas</text>
    <text x="30" y="60" class="subtitle stagger delay-1">Baseado no volume de código dos repositórios</text>
    
    ${langBars}
  </svg>
  `;
}

async function main() {
  try {
    const rawData = await fetchGitHubData();
    const { stats, topLanguages } = processData(rawData);

    fs.writeFileSync('stats-card.svg', generateStatsCard(stats));
    fs.writeFileSync('langs-card.svg', generateLangCard(topLanguages));
    
    console.log('✨ Cards dinâmicos e minimalistas gerados com sucesso!');
  } catch (error) {
    console.error('Erro na geração:', error);
    process.exit(1);
  }
}

main();
