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

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

function pickHost(matches, which) {
  if (!matches || !matches.length) return null;
  const m = which === 'first' ? matches[0] : matches[matches.length - 1];
  const host = m.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase();
  return 'https://' + host;
}

// 텔레그램 채널: 마지막 매치 = 가장 최신 메시지의 주소
async function fromTelegram(channel, key) {
  const html = await fetchHtml('https://t.me/s/' + channel);
  return pickHost(html.match(patternFor(key)), 'last');
}

// 일반 웹페이지(주소모음 등): 첫 매치 = 목록에 표기된 현재 주소
async function fromPage(pageUrl, key) {
  const html = await fetchHtml(pageUrl);
  return pickHost(html.match(patternFor(key)), 'first');
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  let changed = false;
  for (const [key, cfg] of Object.entries(data)) {
    try {
      let url = null;
      if (cfg.page) {                       // 웹페이지 소스 (예: jusoland)
        url = await fromPage(cfg.page, key);
      } else if (cfg.channel) {             // 텔레그램 소스
        url = await fromTelegram(normChannel(cfg.channel), key);
      } else {
        console.log('- ' + key + ': 소스 미설정, 건너뜀'); continue;
      }
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
