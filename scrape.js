const fs = require('fs');
const path = './urls.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 이 스크래퍼는 "후보 주소 목록"만 수집한다. (최신 메시지 우선)
// 실제로 어느 주소가 연결되는지는 태블릿(각 폴더 index.html)이 직접 판단한다.
const NMSGS = 3;  // 텔레그램에서 최신 메시지 N개만 본다 (옛 주소 churn 제외)

function normChannel(c) {
  return String(c)
    .replace(/^https?:\/\/t\.me\/s\//i, '')
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .trim();
}

function patternFor(key) {
  return new RegExp('(?:https?:\\/\\/)?(?:www\\.)?' + key + '\\d*\\.[a-z]{2,8}', 'gi');
}

function normHost(m) {
  return 'https://' + m.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase();
}

function hostsFromText(text, key, out) {
  const found = text.match(patternFor(key)) || [];
  for (const f of found) {
    const h = normHost(f);
    if (out.indexOf(h) < 0) out.push(h);
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

// 텔레그램: 최신 메시지 N개에서만, 최신순으로 후보 수집
async function candsFromTelegram(channel, key) {
  const html = await fetchHtml('https://t.me/s/' + channel);
  const parts = html.split('tgme_widget_message_text');  // 메시지 텍스트별 분할
  const msgs = parts.slice(1);                            // 오래된→최신
  const recent = msgs.slice(-NMSGS).reverse();            // 최신 메시지 먼저
  const out = [];
  for (const m of recent) hostsFromText(m, key, out);
  return out;
}

// 주소모음 페이지(jusoland 등): 등장 순서대로 후보 수집
async function candsFromPage(pageUrl, key) {
  const html = await fetchHtml(pageUrl);
  const out = [];
  hostsFromText(html, key, out);
  return out;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  let changed = false;
  for (const [key, cfg] of Object.entries(data)) {
    try {
      let cands = null;
      if (cfg.channel) cands = await candsFromTelegram(normChannel(cfg.channel), key);
      else if (cfg.page) cands = await candsFromPage(cfg.page, key);
      else if (cfg.gen) { console.log('- ' + key + ': gen(클라이언트 생성), 스킵'); continue; }
      else { console.log('- ' + key + ': 소스 없음, 스킵'); continue; }

      if (!cands || !cands.length) { console.log('- ' + key + ': 후보 못 찾음(유지)'); continue; }
      const before = JSON.stringify(cfg.candidates || []);
      const after = JSON.stringify(cands);
      if (before !== after) {
        console.log('✓ ' + key + ': [' + cands.join(', ') + ']');
        cfg.candidates = cands;
        cfg.updated = new Date().toISOString();
        changed = true;
      } else {
        console.log('= ' + key + ': 변동 없음 (' + cands.length + '개)');
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
