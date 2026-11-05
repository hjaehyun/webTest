/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script, not app code */
// UI check for editing fragments (today page). Mocks /api/*, so no Supabase is needed.
//   npm run build && npx next start -p 3123   (any env values; /api is mocked)
//   BASE=http://localhost:3123 node scripts/ui-entry-edit.cjs
// Needs Playwright (npm i -D playwright && npx playwright install chromium). Exit 0 = all passed.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3123';
const log = (...a) => console.log('[DEBUG]', ...a);
let failed = 0;
const expect = (name, ok) => { console.log(ok ? '[PASS]' : '[FAIL]', name); if (!ok) failed++; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 430, height: 900 } });
  const calls = [];
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const entries = [
    { id: '11111111-1111-4111-8111-111111111111', at: new Date(now - 3600e3).toISOString(), text: '첫 조각' },
    { id: '22222222-2222-4222-8222-222222222222', at: new Date(now - 1800e3).toISOString(), text: '점심으로 김치찌개 먹음' },
    { id: '33333333-3333-4333-8333-333333333333', at: new Date(now - 600e3).toISOString(), text: '마지막 조각' },
  ];
  const me = {
    account: { email: 't@test', joinedAt: now.toISOString() }, profile: { nick: '테스트', style: 'water' },
    drafts: { [key]: entries }, artworks: {}, exhibition: { id: 'x', title: '나의 전시', desc: '', isPublic: false, dates: [] },
  };
  await p.route('**/api/**', async (r) => {
    const req = r.request(); const path = new URL(req.url()).pathname;
    if (req.method() !== 'GET') calls.push(`${req.method()} ${path} ${req.postData() || ''}`);
    if (path === '/api/me') return r.fulfill({ json: me });
    return r.fulfill({ json: { ok: true } });
  });
  p.on('console', (m) => { if (m.type() === 'debug' || m.type() === 'error') log('browser', m.type(), m.text()); });
  p.on('pageerror', (e) => log('pageerror', e.message));

  await p.goto(BASE + '/today', { waitUntil: 'networkidle' });
  const order = async () => p.$$eval('button[aria-expanded]', (els) => els.map((e) => e.innerText));
  log('initial order', JSON.stringify(await order()));

  // 1) 수정 누르고 취소 → 아무 요청 없음, 원본 유지
  await p.click('button:has-text("김치찌개")'); await p.click('button:has-text("수정")');
  expect('edit bar shown', await p.isVisible('text=조각을 고치는 중이에요'));
  expect('input has original text', (await p.inputValue('#frag')) === '점심으로 김치찌개 먹음');
  expect('original still listed while editing', (await order()).includes('점심으로 김치찌개 먹음'));
  expect('close bar hidden while editing', !(await p.isVisible('text=오늘 마감하고 그림 그리기')));
  await p.click('.' + (await p.$eval('text=조각을 고치는 중이에요', (e) => e.parentElement.className.split(' ')[0])) + ' button');
  expect('cancel: no API call', calls.length === 0);
  expect('cancel: input cleared', (await p.inputValue('#frag')) === '');

  // 2) 수정 누르고 Esc → 요청 없음
  await p.click('button:has-text("김치찌개")'); await p.click('button:has-text("수정")');
  await p.press('#frag', 'Escape');
  expect('Esc: no API call, edit bar gone', calls.length === 0 && !(await p.isVisible('text=조각을 고치는 중이에요')));

  // 3) 수정 누르고 그냥 새로고침 → 요청 없음 (예전에는 여기서 DELETE 가 나가 조각이 사라졌음)
  await p.click('button:has-text("김치찌개")'); await p.click('button:has-text("수정")');
  await p.reload({ waitUntil: 'networkidle' });
  expect('abandon by reload: no DELETE sent', !calls.some((c) => c.startsWith('DELETE')));

  // 4) 내용 그대로 저장 → 요청 없음
  await p.click('button:has-text("김치찌개")'); await p.click('button:has-text("수정")');
  await p.press('#frag', 'Enter');
  expect('save unchanged text: no API call', calls.length === 0);

  // 5) 고쳐서 저장 → PATCH 한 번, DELETE/POST 없음, 순서 유지
  await p.click('button:has-text("김치찌개")'); await p.click('button:has-text("수정")');
  expect('send button labelled 수정 저장', await p.isVisible('button[aria-label="수정 저장"]'));
  await p.fill('#frag', '저녁으로 된장찌개 먹음');
  await p.press('#frag', 'Enter');
  await p.waitForTimeout(500);
  log('calls', JSON.stringify(calls));
  expect('exactly one PATCH to the entry', calls.length === 1 && calls[0].startsWith('PATCH /api/me/entries/22222222-2222-4222-8222-222222222222'));
  expect('PATCH body is {text}', calls[0].endsWith('{"text":"저녁으로 된장찌개 먹음"}'));
  const after = await order();
  log('order after edit', JSON.stringify(after));
  expect('edited text shown in the same (middle) position', after[1] === '저녁으로 된장찌개 먹음' && after.length === 3);

  // 6) 수정 중에 그 조각을 지우면 수정 상태가 풀림
  await p.click('button:has-text("마지막 조각")'); await p.click('button:has-text("수정")');
  await p.click('button:has-text("마지막 조각")'); await p.click('button:has-text("지우기")');
  await p.waitForTimeout(300);
  expect('deleting the edited fragment ends editing', !(await p.isVisible('text=조각을 고치는 중이에요')) && (await p.inputValue('#frag')) === '');
  expect('that delete sent DELETE', calls.some((c) => c.startsWith('DELETE /api/me/entries/33333333')));

  // 7) 새 조각 추가는 그대로 POST
  await p.fill('#frag', '새 조각'); await p.press('#frag', 'Enter'); await p.waitForTimeout(300);
  expect('adding still POSTs', calls.some((c) => c.startsWith('POST /api/me/entries')));

  await p.screenshot({ path: require('os').tmpdir() + '/ui-entry-edit.png' });
  await b.close();
  console.log(failed ? `== ${failed} failed` : '== all UI checks passed');
  process.exit(failed ? 1 : 0);
})();
