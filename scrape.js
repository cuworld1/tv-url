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

// 번호형 도메인 직접 탐지: 이름(base)은 고정, 숫자 + 여러 TLD를 모두 시도해
// "살아있는(응답)" 후보 중 가장 높은 번호(동률이면 TLD 우선순위)로 자동 선택
async function probeAlive(host) {
  try {
    const res = await fetch('https://' + host + '/', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000)
    });
    return res.status >= 200 && res.status < 400;
  } catch (e) {
    return false;
  }
}

async function fromProbe(p) {
  const tlds = (p.tlds && p.tlds.length) ? p.tlds : (p.tld ? [p.tld] : ['com']);
  const cands = [];
  for (let ti = 0; ti < tlds.length; ti++) {
    for (let n = p.from; n <= p.to; n++) {
      cands.push({ num: n, tldIdx: ti, host: p.base + n + '.' + tlds[ti] });
    }
  }
  const live = [];
  let i = 0;
  const CONC = 30;                          // 동시 확인 개수
  async function worker() {
    while (i < cands.length) {
      const c = cands[i++];
      if (await probeAlive(c.host)) live.push(c);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  if (!live.length) return null;
  // 가장 높은 번호 우선, 같은 번호면 tlds 배열 앞쪽 우선
  live.sort(function (a, b) { return (b.num - a.num) || (a.tldIdx - b.tldIdx); });
  return 'https://' + live[0].host;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  let changed = false;
  for (const [key, cfg] of Object.entries(data)) {
    try {
      let url = null;
      if (cfg.probe) {                      // 번호형 도메인 직접 탐지 (예: dodotv)
        url = await fromProbe(cfg.probe);
      } else if (cfg.page) {                // 웹페이지 소스 (예: jusoland)
        url = await fromPage(cfg.page, key);
      } else if (cfg.channel) {             // 텔레그램 소스
        url = await fromTelegram(normChannel(cfg.channel), key);
      } else {
        console.log('- ' + key + ': 소스 미설정, 건너뜀'); continue;
      }
      if (!url) { console.log('- ' + key + ': 주소 못 찾음'); continue; }
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
