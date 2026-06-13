const fs = require('fs');
const path = './urls.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 전체 URL/@핸들 무엇이 와도 순수 핸들만 추출
function normChannel(c) {
  return String(c)
    .replace(/^https?:\/\/t\.me\/s\//i, '')
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .trim();
}

// 사이트 키로부터 도메인 패턴 생성 (예: tvwiki -> tvwiki27.net)
function patternFor(key) {
  return new RegExp('(?:https?:\\/\\/)?(?:www\\.)?' + key + '\\d*\\.[a-z]{2,8}', 'gi');
}

async function latestUrl(channel, key) {
  const res = await fetch('https://t.me/s/' + channel, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const m = html.match(patternFor(key));
  if (!m) return null;
  // 마지막 매치 = 가장 최신 메시지의 주소
  const host = m[m.length - 1]
    .replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase();
  return 'https://' + host;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  let changed = false;
  for (const [key, cfg] of Object.entries(data)) {
    const channel = normChannel(cfg.channel || '');
    if (!channel) { console.log('- ' + key + ': 채널 미설정, 건너뜀'); continue; }
    try {
      const url = await latestUrl(channel, key);
      if (!url) { console.log('- ' + key + ': 주소 패턴 못 찾음'); continue; }
      if (cfg.url !== url) {
        console.log('✓ ' + key + ': ' + (cfg.url || '(없음)') + ' -> ' + url);
        cfg.url = url;
        cfg.updated = new Date().toISOString();
        changed = true;
      } else {
        console.log('= ' + key + ': 변동 없음 (' + url + ')');
      }
    } catch (e) {
      console.log('! ' + key + ': 실패 - ' + e.message);
    }
  }
  if (changed) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
    console.log('urls.json 갱신됨');
  } else {
    console.log('변경 사항 없음');
  }
})();
