(function () {
  'use strict';

  const D = window.SCNU;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- 상단 띠배너 ---------- */
  const TOP_KEY = 'scnu_top_hide_until';
  function initTopPopup() {
    const layer = $('#topLayer');
    let hideUntil = 0;
    try { hideUntil = Number(localStorage.getItem(TOP_KEY)) || 0; } catch (e) { /* storage blocked */ }
    if (Date.now() < hideUntil) { layer.remove(); return; }

    $('#topPopList').innerHTML = D.topPopups.map((p) => `
      <li class="${p.color}">
        <a href="#">
          <strong>${esc(p.title)}</strong>
          ${p.desc ? `<span>${esc(p.desc)}</span>` : ''}
          <em>자세히보기 <i class="ri-add-circle-line"></i></em>
        </a>
      </li>`).join('');

    $('#topClose').addEventListener('click', () => {
      if ($('#topToday').checked) {
        try { localStorage.setItem(TOP_KEY, String(Date.now() + 864e5)); } catch (e) { /* ignore */ }
      }
      layer.classList.add('closed');
      setTimeout(() => layer.remove(), 400);
    });
  }

  /* ---------- GNB / 전체메뉴 ---------- */
  function initMenu() {
    const subList = (sub) => `<ul class="depth2">${sub.map((s) => `<li><a href="#">${esc(s)}</a></li>`).join('')}</ul>`;
    $('#gnbList').innerHTML = D.gnb.map((m) => `<li><a href="#">${esc(m.t)}</a>${subList(m.sub)}</li>`).join('');
    $('#allMenuList').innerHTML = D.gnb.map((m) => `<li><h3>${esc(m.t)}</h3>${subList(m.sub)}</li>`).join('');

    const header = $('#header');
    $$('#gnbList > li').forEach((li) => {
      li.addEventListener('mouseenter', () => header.classList.add('gnb_on'));
      li.addEventListener('focusin', () => header.classList.add('gnb_on'));
    });
    header.addEventListener('mouseleave', () => header.classList.remove('gnb_on'));

    const allMenu = $('#allMenu');
    $('#allMenuOpen').addEventListener('click', () => { allMenu.classList.add('on'); document.body.classList.add('lock'); });
    $('#allMenuClose').addEventListener('click', () => { allMenu.classList.remove('on'); document.body.classList.remove('lock'); });

    $('.lang_btn').addEventListener('click', (e) => e.currentTarget.parentElement.classList.toggle('on'));

    const searchBtn = $('#searchOpen');
    searchBtn.addEventListener('click', () => {
      const on = $('#searchLayer').classList.toggle('on');
      searchBtn.setAttribute('aria-label', on ? '검색 비활성화' : '검색 활성화');
      searchBtn.innerHTML = on ? '<i class="ri-close-line"></i>' : '<i class="ri-search-line"></i>';
      if (on) $('#searchLayer input').focus();
    });

    window.addEventListener('scroll', () => header.classList.toggle('fixed', window.scrollY > 10), { passive: true });
  }

  /* ---------- 퀵메뉴 레이어 + 팝업존 ---------- */
  function initLayers() {
    $$('.quick button').forEach((btn) => {
      btn.addEventListener('click', () => $('#' + btn.dataset.layer).classList.add('on'));
    });
    $$('.layer').forEach((layer) => {
      layer.addEventListener('click', (e) => {
        if (e.target === layer || e.target.closest('.layer_close')) layer.classList.remove('on');
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $$('.layer.on, .allmenu.on').forEach((l) => l.classList.remove('on'));
    });

    $('#popCnt').textContent = D.popups.length;
    $('#popSlider').innerHTML = D.popups.map((t, i) => `
      <div class="pop_item${i === 0 ? ' on' : ''}" style="--h:${200 + i * 30}">
        <p>${esc(t)}</p><a href="#">자세히보기 <i class="ri-add-circle-line"></i></a>
      </div>`).join('');
    let idx = 0;
    const items = $$('.pop_item');
    const go = (n) => {
      items[idx].classList.remove('on');
      idx = (n + items.length) % items.length;
      items[idx].classList.add('on');
      $('#popPage').textContent = `${idx + 1} / ${items.length}`;
    };
    go(0);
    $('#popPrev').addEventListener('click', () => go(idx - 1));
    $('#popNext').addEventListener('click', () => go(idx + 1));
  }

  /* ---------- 메인 비주얼 ---------- */
  function initVisual() {
    const btn = $('#btnMute');
    btn.addEventListener('click', () => {
      const muted = btn.classList.toggle('unmuted');
      btn.innerHTML = muted ? '<i class="ri-volume-up-line"></i> 음소거' : '<i class="ri-volume-mute-line"></i> 음소거 해제';
    });
  }

  /* ---------- 바로가기 슬라이더 ---------- */
  function initQuickLinks() {
    const track = $('#quickTrack');
    track.innerHTML = D.quickLinks.map(([name, icon]) => `
      <li><a href="#"><span class="ico"><i class="${icon}"></i></span><span class="txt">${esc(name)}</span></a></li>`).join('');

    const perView = () => (window.innerWidth <= 768 ? 4 : window.innerWidth <= 1200 ? 6 : 10);
    let page = 0;
    const pages = () => Math.ceil(D.quickLinks.length / perView());
    const dots = $('#quickDots');

    function render() {
      const n = pages();
      page = Math.min(page, n - 1);
      track.style.setProperty('--per', perView());
      track.style.transform = `translateX(-${page * 100}%)`;
      dots.innerHTML = Array.from({ length: n }, (_, i) => `<li class="${i === page ? 'on' : ''}"><button type="button" aria-label="${i + 1}"></button></li>`).join('');
      $$('button', dots).forEach((b, i) => b.addEventListener('click', () => { page = i; render(); }));
    }
    $('.ql_prev').addEventListener('click', () => { page = (page - 1 + pages()) % pages(); render(); });
    $('.ql_next').addEventListener('click', () => { page = (page + 1) % pages(); render(); });
    window.addEventListener('resize', render);
    render();
  }

  /* ---------- 공지 탭 ---------- */
  function initNotice() {
    const names = Object.keys(D.notices);
    $('#noticeTabs').innerHTML = names.map((n, i) =>
      `<button type="button" role="tab" class="${i === 0 ? 'current' : ''}" aria-selected="${i === 0}">${esc(n)}</button>`).join('');
    $('#noticePanels').innerHTML = names.map((n, i) => `
      <div class="list_box${i === 0 ? ' on' : ''}" role="tabpanel">
        <ul>${D.notices[n].map(([t, d]) => `
          <li><a href="#"><span class="cate">${esc(n)}</span><p class="tit">${esc(t)}</p><span class="date">${d}</span></a></li>`).join('')}
        </ul>
        <a href="#" class="btn_more"><em class="hid">${esc(n)}</em><span>더보기</span> <i class="ri-add-large-line"></i></a>
      </div>`).join('');

    const tabs = $$('#noticeTabs button');
    const panels = $$('#noticePanels .list_box');
    tabs.forEach((tab, i) => tab.addEventListener('click', () => {
      tabs.forEach((t, j) => { t.classList.toggle('current', i === j); t.setAttribute('aria-selected', i === j); });
      panels.forEach((p, j) => p.classList.toggle('on', i === j));
    }));
  }

  /* ---------- 학사일정 ---------- */
  function initSchedule() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    $('#today').textContent = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;

    const list = $('#scheList');
    list.innerHTML = D.schedules.map(([date, title]) => `
      <li><a href="#"><span class="d">${date}</span><strong>${esc(title)}</strong></a></li>`).join('');

    let offset = 0;
    const visible = 2;
    const max = Math.max(0, D.schedules.length - visible);
    const move = () => { list.style.transform = `translateX(calc(-${offset} * (50% + 10px)))`; };
    $('#schePrev').addEventListener('click', () => { offset = offset > 0 ? offset - 1 : max; move(); });
    $('#scheNext').addEventListener('click', () => { offset = offset < max ? offset + 1 : 0; move(); });
  }

  /* ---------- SCNU MEDIA ---------- */
  function initMedia() {
    $('#mediaMain').innerHTML = D.media.main.map((m) => `
      <li><a href="#">
        <div class="thumb" style="--h:${m.hue}"><span class="badge">${esc(m.cat)}</span></div>
        <strong class="tit">${esc(m.title)}</strong>
        <p class="desc">${esc(m.desc)}</p>
        <span class="date">${m.date}</span>
      </a></li>`).join('');
    $('#mediaGrid').innerHTML = D.media.grid.map((m) => `
      <li><a href="#">
        <div class="thumb" style="--h:${m.hue}"></div>
        <p class="meta"><span class="cat">${esc(m.cat)}</span><span class="org">${esc(m.org)}</span></p>
        <strong class="tit">${esc(m.title)}</strong>
        <span class="date">${m.date}</span>
      </a></li>`).join('');
  }

  /* ---------- 스쿨&단과대학 캐러셀 ---------- */
  function initSchools() {
    const track = $('#schoolTrack');
    const list = D.schools;
    track.innerHTML = list.map((s, i) => `
      <li data-i="${i}" style="--h:${s.hue}"><a href="#">
        <p class="eng">${esc(s.eng)}</p>
        <p class="kor">${s.type ? `<span>${esc(s.type)}</span>` : ''}<strong>${esc(s.name)}</strong></p>
      </a></li>`).join('');
    $('#scTot').textContent = list.length;

    const items = $$('li', track);
    let cur = 0;
    let timer = null;

    function layout() {
      const n = items.length;
      items.forEach((el, i) => {
        let rel = (i - cur + n) % n;
        if (rel > n / 2) rel -= n;
        el.className = rel === 0 ? 'active' : Math.abs(rel) === 1 ? 'side' : 'far';
        el.style.setProperty('--x', rel);
      });
      $('#scCur').textContent = cur + 1;
    }
    const go = (n) => { cur = (n + items.length) % items.length; layout(); };
    const play = () => { stop(); timer = setInterval(() => go(cur + 1), 4000); };
    const stop = () => { clearInterval(timer); timer = null; };

    $('.sc_prev').addEventListener('click', () => go(cur - 1));
    $('.sc_next').addEventListener('click', () => go(cur + 1));
    $('#scPlay').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (timer) { stop(); btn.innerHTML = '<i class="ri-play-line"></i>'; btn.setAttribute('aria-label', '슬라이드 재생 버튼'); }
      else { play(); btn.innerHTML = '<i class="ri-pause-line"></i>'; btn.setAttribute('aria-label', '슬라이드 정지 버튼'); }
    });
    layout();
    play();
  }

  /* ---------- 푸터 사이트 링크 ---------- */
  function initFooter() {
    $('#siteLink').innerHTML = Object.entries(D.siteLinks).map(([k, arr]) => `
      <div class="site_item">
        <button type="button" aria-expanded="false">${esc(k)} <i class="ri-add-line"></i></button>
        <ul>${arr.map((a) => `<li><a href="#">${esc(a)}</a></li>`).join('')}</ul>
      </div>`).join('');
    $$('#siteLink button').forEach((btn) => btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const open = !item.classList.contains('on');
      $$('#siteLink .site_item').forEach((s) => { s.classList.remove('on'); $('button', s).setAttribute('aria-expanded', 'false'); });
      if (open) { item.classList.add('on'); btn.setAttribute('aria-expanded', 'true'); }
    }));
    $('#btnTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* ---------- 스크롤 등장 모션 ---------- */
  function initReveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.15 });
    $$('.reveal, .media_main li, .media_grid li').forEach((el) => io.observe(el));
  }

  initTopPopup();
  initMenu();
  initLayers();
  initVisual();
  initQuickLinks();
  initNotice();
  initSchedule();
  initMedia();
  initSchools();
  initFooter();
  initReveal();
})();
