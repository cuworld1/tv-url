// 텔레그램 채널/주소페이지에서 각 사이트의 "공식 주소 목록"을 자동 수집해 urls.json auto[]에 기록(병합).
// gen 사이트(dodotv 등 channel/page 없음)는 건너뜀.
const fs = require('fs');
const https = require('https');

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.setTimeout(20000, () => { req.destroy(); resolve(''); });
  });
}

function patternFor(name) {
  return new RegExp('(?:https?:\\/\\/)?(?:www\\.)?(' + name + '\\d*\\.[a-z]{2,8})', 'gi');
}

function normHost(h) {
  return 'https://' + h.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
}

function extractAll(text, name) {
  const re = patternFor(name);
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const u = normHost(m[1]);
    if (out.indexOf(u) < 0) out.push(u);
    if (out.length >= 12) break;
  }
  return out;
}

async function fromTelegram(channel, name) {
  const html = await get('https://t.me/s/' + channel);
  if (!html) return [];
  const blocks = html.split('tgme_widget_message_wrap').slice(1);
  if (!blocks.length) return [];
  // 최근 메시지들에서 공식 주소를 "전부" 누적 (최신 우선, 중복 제거)
  const recent = blocks.slice(-15).reverse();
  const out = [];
  for (const b of recent) {
    extractAll(b, name).forEach((u) => { if (out.indexOf(u) < 0) out.push(u); });
    if (out.length >= 12) break;
  }
  return out;
}

async function fromPage(pageUrl, name) {
  const html = await get(pageUrl);
  if (!html) return [];
  return extractAll(html, name);
}

(async () => {
  const cfg = JSON.parse(fs.readFileSync('urls.json', 'utf8'));
  for (const key of Object.keys(cfg)) {
    if (key.charAt(0) === '_') continue;
    const site = cfg[key];
    if (!site || typeof site !== 'object') continue;
    const name = site.name || key;
    let auto = [];
    if (site.channel) auto = await fromTelegram(site.channel, name);
    else if (site.page) auto = await fromPage(site.page, name);
    else { console.log(key + ' -> (gen 사이트, 건너뜀)'); continue; }
    if (auto.length) {
      const merged = auto.slice();
      (site.auto || []).forEach((u) => { if (merged.indexOf(u) < 0) merged.push(u); });
      site.auto = merged.slice(0, 15);
      console.log(key + ' -> ' + site.auto.join(', '));
    } else {
      console.log(key + ' -> (수집 실패, 기존 auto 유지)');
    }
  }
  fs.writeFileSync('urls.json', JSON.stringify(cfg, null, 2) + '\n');
})();
