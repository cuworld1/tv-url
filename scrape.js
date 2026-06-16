const fs = require('fs');
const path = './urls.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 이 스크래퍼는 "후보 주소 목록"만 수집한다.
// 실제로 어느 주소가 "연결되는지"는 태블릿(각 폴더의 index.html)이 직접 판단한다.
// (GitHub 서버에서는 이 사이트들이 차단/간헐이라 서버측 판단이 불가능하기 때문)

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

function numOf(host) {
  const m = host.match(/[a-z]+(\d+)\./i);
  return m ? parseInt(m[1], 10) : 0;
}

// 중복 제거 + 번호 높은 순(최신) 정렬
function sortCands(arr) {
  const uniq = Array.from(new Set(arr));
  uniq.sort(function (a, b) { return (numOf(b) - numOf(a)) || a.localeCompare(b); });
  return uniq;
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

async function candsFromTelegram(channel, key) {
  const html = await fetchHtml('https://t.me/s/' + channel);
  return sortCands((html.match(patternFor(key)) || []).map(normHost));
}

async function candsFromPage(pageUrl, key) {
  const html = await fetchHtml(pageUrl);
  return sortCands((html.match(patternFor(key)) || []).map(normHost));
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  let changed = false;
  for (const [key, cfg] of Object.entries(data)) {
    try {
      let cands = null;
      if (cfg.channel) {
        cands = await candsFromTelegram(normChannel(cfg.channel), key);
      } else if (cfg.page) {
        cands = await candsFromPage(cfg.page, key);
      } else if (cfg.gen) {
        console.log('- ' + key + ': gen 방식(클라이언트 생성), 스킵');
        continue;
      } else {
        console.log('- ' + key + ': 소스 없음, 스킵');
        continue;
      }
      if (!cands || !cands.length) { console.log('- ' + key + ': 후보 못 찾음'); continue; }
      const before = JSON.stringify(cfg.candidates || []);
      const after = JSON.stringify(cands);
      if (before !== after) {
        console.log('✓ ' + key + ': 후보 ' + cands.length + '개 [' + cands.slice(0, 4).join(', ') + (cands.length > 4 ? ', …' : '') + ']');
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
