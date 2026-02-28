import fs from 'node:fs';

const TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.GITHUB_ACTOR; 

async function fetchGitHubStats() {
  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
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

  const data = await response.json();
  return data.data.user.contributionsCollection.contributionCalendar.totalContributions;
}

async function generateCard() {
  try {
    const totalContributions = await fetchGitHubStats();

    const svg = `
    <svg width="400" height="150" viewBox="0 0 400 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>
        .title { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-weight: 700; fill: #C9D1D9; font-size: 18px; }
        .stat { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; fill: #58A6FF; font-size: 28px; font-weight: bold; }
        .bg { fill: #0D1117; stroke: #30363D; stroke-width: 1; rx: 8px; }
      </style>
      
      <rect width="100%" height="100%" class="bg" />
      <text x="24" y="45" class="title">Status de ${USERNAME}</text>
      <text x="24" y="85" class="title" style="font-size: 14px; font-weight: 400; fill: #8B949E;">Contribuições no último ano:</text>
      <text x="24" y="120" class="stat">${totalContributions}</text>
    </svg>
    `;

    fs.writeFileSync('meu-card.svg', svg);
    console.log('✨ SVG gerado com sucesso!');
    
  } catch (error) {
    console.error('Erro ao gerar o card:', error);
    process.exit(1);
  }
}

generateCard();
