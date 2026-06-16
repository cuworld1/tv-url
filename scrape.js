const fs = require('fs');
const path = './urls.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

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

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

// 텔레그램: 가장 최근 메시지(최근 5개 내)에서 첫 주소 = 현재 공식 주소
async function urlFromTelegram(channel, key) {
  const html = await fetchHtml('https://t.me/s/' + channel);
  const parts = html.split('tgme_widget_message_wrap').slice(1);  // 오래된→최신
  for (let i = parts.length - 1; i >= 0 && i >= parts.length - 5; i--) {
    const m = parts[i].match(patternFor(key));
    if (m && m.length) return normHost(m[0]);   // 그 메시지의 첫 주소
  }
  return null;
}

// 주소모음 페이지(tvhot=jusoland): 후보 목록(클라이언트 probe용)
async function candsFromPage(pageUrl, key) {
  const html = await fetchHtml(pageUrl);
  const out = [];
  (html.match(patternFor(key)) || []).forEach(function (f) {
    const h = normHost(f);
    if (out.indexOf(h) < 0) out.push(h);
  });
  return out;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  let changed = false;
  for (const [key, cfg] of Object.entries(data)) {
    try {
      if (cfg.channel) {
        // 텔레그램 → 단일 url (최신 메시지 주소). 못 찾으면 마지막 주소 유지.
        const u = await urlFromTelegram(normChannel(cfg.channel), key);
        if (!u) { console.log('- ' + key + ': 새 주소 없음 → 유지(' + (cfg.url || '없음') + ')'); continue; }
        if (cfg.url !== u) {
          console.log('✓ ' + key + ': ' + (cfg.url || '(없음)') + ' → ' + u);
          cfg.url = u; cfg.updated = new Date().toISOString(); changed = true;
        } else {
          console.log('= ' + key + ': 변동 없음 (' + u + ')');
        }
      } else if (cfg.page) {
        // tvhot → 후보 목록(클라이언트 probe)
        const cands = await candsFromPage(cfg.page, key);
        if (!cands.length) { console.log('- ' + key + ': 후보 없음(유지)'); continue; }
        if (JSON.stringify(cfg.candidates || []) !== JSON.stringify(cands)) {
          console.log('✓ ' + key + ': 후보 [' + cands.join(', ') + ']');
          cfg.candidates = cands; cfg.updated = new Date().toISOString(); changed = true;
        } else {
          console.log('= ' + key + ': 변동 없음');
        }
      } else if (cfg.gen) {
        console.log('- ' + key + ': gen(클라이언트 생성), 스킵');
      } else {
        console.log('- ' + key + ': 소스 없음, 스킵');
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
