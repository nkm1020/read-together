// Read Together — 1안 app screens. Every block is drawn from the club's records in Supabase (js/db.js).
(() => {
  const D = window.DB;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const batchim = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0; };
  const ga = (w) => w + (batchim(w) ? '이' : '가');
  const wa = (w) => w + (batchim(w) ? '과' : '와');
  const who = (m) => `<span class="who"><i style="--h:${m.hue}" aria-hidden="true">${esc(m.name[0])}</i>${esc(m.name)}</span>`;
  const score = (v) => (v == null ? '<span class="dash" aria-label="불참">–</span>' : D.fmt(v));
  // The round strip: one square per round, toned by that round's accuracy (95%+, 80-94%, under 80%, missed, to come).
  const strip = (subs, total, b) => {
    const by = Object.fromEntries((subs || []).map((x) => [x.round, x]));
    const cur = b ? b.current_round : total;
    const open = !!b && b.status === 'open';
    const over = !b || b.status === 'finished';
    const sent = (subs || []).length, hi = (subs || []).filter((x) => x.accuracy >= 95).length;
    return `<span class="strip" role="img" aria-label="${total}라운드 중 ${sent}라운드 제출, 정확도 95% 이상 ${hi}번">${Array.from({ length: total }, (_, i) => {
      const r = i + 1, x = by[r];
      if (x) return `<i class="${x.accuracy >= 95 ? 'hi' : x.accuracy >= 80 ? 'mid' : 'lo'}" title="라운드 ${r} · 정확도 ${x.accuracy}%"></i>`;
      if (open && r === cur) return `<i class="now" title="라운드 ${r} · 진행 중"></i>`;
      if (over || r < cur || r === cur) return `<i class="miss" title="라운드 ${r} · 안 냄"></i>`;
      return '<i class="todo"></i>';
    }).join('')}</span>`;
  };
  const stripKey = `<div class="strip-key" aria-hidden="true"><span><span class="strip"><i class="hi"></i></span>정확도 95% 이상</span><span><span class="strip"><i class="mid"></i></span>80–94%</span><span><span class="strip"><i class="lo"></i></span>80% 미만</span><span><span class="strip"><i class="miss"></i></span>안 냄</span></div>`;
  const kindName = (k) => (k === 'reading' ? 'Reading & Discussion' : 'Dictation Battle');
  const page = document.body.dataset.page;
  const RELOGIN = '로그인이 풀렸어요. 다시 로그인한 뒤 저장을 다시 눌러 주세요.';
  const ERR = {
    code: '코드가 달라요. 진행자 화면의 네 자리 숫자를 확인해 주세요.',
    member: '활동 중인 멤버만 들어올 수 있어요. 운영진에게 말해 주세요.',
    closed: '지금은 제출할 수 없어요. 진행자가 라운드를 열면 다시 내 주세요.',
    not_joined: '먼저 입장해 주세요.',
    already: '이번 라운드는 이미 냈어요.',
    no_script: '이 라운드의 정답 스크립트가 아직 없어요. 진행자에게 알려 주세요.',
    session: '문장을 남길 수 있는 회차가 아니에요.',
    session_group: '그 그룹이 모이지 않는 회차예요.',
    admin: '운영진만 할 수 있어요.',
    not_signed_in: '로그인이 필요해요.',
    taken: '다른 멤버가 쓰는 이름이에요. 다른 이름을 골라 주세요.',
    length: '이름은 1자에서 20자 사이로 적어 주세요.',
  };
  const why = (e) => {
    const m = (e && e.message || '').trim();
    if (/row-level security|JWT/i.test(m)) return RELOGIN;
    return ERR[m] || `문제가 생겼어요: ${m || e}`;
  };

  addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 4), { passive: true });

  // A tab left open keeps running the code it loaded. When a newer version is deployed, offer a reload.
  (() => {
    if (!location.protocol.startsWith('http')) return;
    const tag = () => fetch('/js/app.js', { method: 'HEAD', cache: 'no-store' }).then((r) => r.headers.get('etag')).catch(() => null);
    let base = null;
    tag().then((t) => { base = t; });
    const check = async () => {
      const now = await tag();
      if (!base || !now || now === base || document.getElementById('new-version')) return;
      const bar = document.createElement('div');
      bar.id = 'new-version';
      bar.setAttribute('role', 'status');
      bar.innerHTML = '<span>새 버전이 올라왔어요. 새로고침하면 바로 반영돼요.</span><button type="button" class="btn btn-primary">새로고침</button>';
      bar.querySelector('button').addEventListener('click', () => location.reload());
      document.body.appendChild(bar);
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    addEventListener('pageshow', (e) => { if (e.persisted) check(); });
    setInterval(check, 5 * 60 * 1000);
  })();

  // A line for every place that has no data yet, or no connection.
  const offline = '데이터베이스가 아직 연결되지 않았어요. js/config.js에 Supabase 주소와 키를 넣으면 기록이 보여요.';
  const fill = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
  const emptyRow = (cols, text) => `<tr><td colspan="${cols}" class="faint" style="height:64px;white-space:normal">${esc(text)}</td></tr>`;
  const emptyLi = (text) => `<li class="faint" style="white-space:normal">${esc(text)}</li>`;

  // ---------- phone numbers: type the digits, the dashes come by themselves ----------
  const dashPhone = (digits) => {
    const d = digits.slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
    // 010 numbers are always 3-4-4; older 011·016·019 numbers may be 3-3-4.
    if (d.length === 10 && !d.startsWith('010')) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };
  const lastDigits = new WeakMap();
  const isTel = (el) => el && el.matches && el.matches('input[type="tel"]');
  document.addEventListener('focusin', (e) => { if (isTel(e.target)) lastDigits.set(e.target, e.target.value.replace(/[^0-9]/g, '')); });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!isTel(el)) return;
    let digits = el.value.replace(/[^0-9]/g, '');
    let at = el.value.slice(0, el.selectionStart).replace(/[^0-9]/g, '').length;
    if (/^82\d{9,10}$/.test(digits)) { digits = '0' + digits.slice(2); at = Math.max(0, at - 1); } // pasted as +82 10-…
    // Backspace over a dash removes the digit before it, so the caret never gets stuck.
    if (e.inputType === 'deleteContentBackward' && digits === lastDigits.get(el) && at > 0) { digits = digits.slice(0, at - 1) + digits.slice(at); at -= 1; }
    digits = digits.slice(0, 11);
    el.value = dashPhone(digits);
    lastDigits.set(el, digits);
    let i = 0;
    for (let seen = 0; i < el.value.length && seen < at; i++) if (/[0-9]/.test(el.value[i])) seen++;
    el.setSelectionRange(i, i);
  });

  // ---------- login with a phone number ----------
  let dialog = null;
  const openLogin = (note) => {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'login';
      dialog.innerHTML = `
        <form id="login-form" class="stack" novalidate>
          <h2 id="login-title">로그인</h2>
          <p class="muted" id="login-lede">신청할 때 적은 휴대폰 번호로 로그인해요.</p>
          <div class="field"><label for="l-phone">휴대폰 번호</label><input class="input num" id="l-phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="010-0000-0000"></div>
          <div class="field"><label for="l-pass" id="l-pass-label">비밀번호</label><input class="input" id="l-pass" type="password" autocomplete="current-password"></div>
          <div class="field" id="l-again-wrap" hidden><label for="l-again">비밀번호 한 번 더</label><input class="input" id="l-again" type="password" autocomplete="new-password"></div>
          <p class="error" id="l-msg" role="alert"></p>
          <div class="login-foot"><button type="button" class="btn" id="l-cancel">닫기</button><button type="submit" class="btn btn-primary" id="l-submit">로그인</button></div>
        </form>`;
      document.body.appendChild(dialog);
      let setting = false;
      const msg = $('#l-msg', dialog);
      const toSetting = () => {
        setting = true;
        $('#login-title', dialog).textContent = '비밀번호 정하기';
        $('#login-lede', dialog).textContent = '처음 로그인이에요. 앞으로 쓸 비밀번호를 정해 주세요. 6자 이상이에요.';
        $('#l-pass-label', dialog).textContent = '새 비밀번호';
        $('#l-pass', dialog).autocomplete = 'new-password';
        $('#l-pass', dialog).value = '';
        $('#l-again-wrap', dialog).hidden = false;
        $('#l-submit', dialog).textContent = '비밀번호 정하고 로그인';
        $('#l-pass', dialog).focus();
      };
      $('#l-cancel', dialog).addEventListener('click', () => dialog.close());
      $('#login-form', dialog).addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = $('#l-phone', dialog).value.replace(/[^0-9]/g, '');
        const pass = $('#l-pass', dialog).value;
        if (!/^01[0-9]{8,9}$/.test(phone)) { msg.textContent = '휴대폰 번호를 010으로 시작하는 숫자로 넣어 주세요.'; return; }
        if (setting) {
          if (pass.length < 6) { msg.textContent = '비밀번호는 6자 이상이에요.'; return; }
          if (pass !== $('#l-again', dialog).value) { msg.textContent = '두 비밀번호가 달라요.'; return; }
        }
        $('#l-submit', dialog).disabled = true;
        try {
          const r = await D.login(phone, pass, setting);
          if (r && r.token) { location.reload(); return; }
          const err = r && r.error;
          if (err === 'set_password') toSetting();
          else msg.textContent = err === 'locked' ? '비밀번호를 5번 틀려서 10분 동안 잠겼어요. 잠시 뒤에 다시 해 주세요.'
            : err === 'short' ? '비밀번호는 6자 이상이에요.'
            : err === 'has_password' ? '이미 비밀번호가 있어요. 로그인해 주세요.'
            : '번호나 비밀번호가 맞지 않아요. 등록되지 않은 번호라면 운영진에게 말해 주세요.';
        } catch (er) { msg.textContent = why(er); }
        $('#l-submit', dialog).disabled = false;
      });
    }
    $('#l-msg', dialog).textContent = note || '';
    if (!dialog.open) dialog.showModal();
    $('#l-phone', dialog).focus();
  };

  const openAdmin = (view) => {
    const go = () => window.RTAdmin.open(view);
    if (window.RTAdmin) return go();
    const s = document.createElement('script');
    s.src = '/js/admin.js';
    s.onload = go;
    document.body.appendChild(s);
  };

  const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSeUK2l8nBtd7qEa8zQUbEIgW0TBEwaIMR9y7j-i5d9013xdkg/viewform?usp=header';

  // The account corner of the menu bar: 로그인, or the member's name, 관리자 and 로그아웃.
  const account = async () => {
    const spots = $$('[data-account]');
    if (!spots.length || !D.ready) return;
    const me = await D.me();
    const html = !me
      ? `<a href="${FORM}">신청하기</a><button type="button" class="btn btn-sm" data-login>로그인</button>`
      : `<a class="me" href="/me"${page === 'me' ? ' aria-current="page"' : ''}>${esc(me.name || '운영진')} 님</a>${me.is_admin ? '<button type="button" class="btn btn-sm" data-admin>관리자</button>' : ''}<button type="button" class="link-btn" data-logout>로그아웃</button>`;
    spots.forEach((el) => {
      el.innerHTML = html;
      $$('[data-admin]', el).forEach((b) => b.addEventListener('click', () => { const m = el.closest('details'); if (m) m.open = false; openAdmin('manage'); }));
      $$('[data-logout]', el).forEach((b) => b.addEventListener('click', async () => { await D.logout(); location.reload(); }));
    });
  };
  account();
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-login]')) return;
    const m = e.target.closest('details'); if (m) m.open = false;
    openLogin();
  });

  window.RTUI = { $, $$, esc, who, why, wa, ga, emptyRow, emptyLi, RELOGIN, openLogin, strip, stripKey };

  const boot = async (draw, tables) => {
    if (!D.ready) { draw(null, new Error('not_configured')); return; }
    const run = async () => {
      if (document.body.dataset.page !== page) return; // an organiser opened the 관리자 screens in its place
      try { draw(await D.load()); } catch (e) { console.error(e); draw(null, e); }
    };
    await run();
    if (tables) { let t; D.watch(tables, () => { clearTimeout(t); t = setTimeout(run, 250); }); }
    return run;
  };

  // ---------- 랭킹 ----------
  // The two groups battle on different clips, so each group has its own ranking. 종합 adds both groups up.
  if (page === 'ranking') {
    let view = null, picked = false, R = null, mineId = null, myGrp = null;
    D.me().then((m) => { mineId = m && m.member_id; myGrp = m && m.grp; draw(); });
    const draw = () => {
      if (!R) return;
      if (!picked) view = (mineId && R.byId[mineId] && R.byId[mineId].grp) || myGrp || 'all';
      const all = view === 'all';
      const scope = all ? '종합' : `${D.groups[view].name} 그룹`;
      const rows = all ? R.standings : R.groupRank(view);
      const n = (s) => (all ? s.rank : s.grank);
      // A group's columns are the sessions its members have a score in.
      const ns = all ? R.battleNs : R.battleNs.filter((x) => rows.some((s) => R.totals[x][s.id] != null));
      const at = ns.map((x) => R.battleNs.indexOf(x));
      const per = (s) => at.map((i) => s.per[i]);
      const came = (s) => per(s).filter((v) => v != null).length;
      // A score from the other group's battle carries that day's mark.
      const cell = (x, s) => {
        const v = R.totals[x][s.id], g = R.from[x][s.id];
        if (v == null) return score(v);
        return g !== s.grp ? `<span class="faint" title="${D.groups[g].name} 모임 배틀">${D.weekday[g]}</span> ${D.fmt(v)}` : D.fmt(v);
      };

      const [a, b] = rows;
      if (!ns.length) $('#finding').innerHTML = `<b>${all ? '아직 확정된 배틀 점수가 없어요.' : `${scope} 배틀 점수가 아직 확정되지 않았어요.`}</b> 배틀이 끝나고 운영진이 점수를 확정하면 여기에 쌓여요.`;
      else if (b && a.total === b.total) $('#finding').innerHTML = `<b>${scope} 1위는 ${esc(wa(a.name))} ${esc(b.name)}, ${D.fmt(a.total)}점으로 같아요.</b>`;
      else if (b) $('#finding').innerHTML = `<b>${scope} 1위는 ${esc(a.name)} 님이에요.</b> ${esc(b.name)} 님보다 ${D.fmt(a.total - b.total)}점 앞서요. 다음 배틀 점수가 더해지면 바뀔 수 있어요.`;
      else $('#finding').innerHTML = `<b>${scope} 1위는 ${esc(a.name)} 님이에요.</b>`;

      $('#board-title').textContent = `누적 점수 · ${scope}`;
      $('#board-meta').textContent = ns.length ? `${ns.map((x) => x + '회차').join('·')} 배틀 합계, 불참은 –${all ? ' · 두 그룹은 클립이 달라요' : ''}` : '확정된 배틀 합계';
      $('#board thead tr').innerHTML = `<th>순위</th><th>이름</th>${all ? '<th>그룹</th>' : ''}${ns.map((x) => `<th class="r">${x}회차</th>`).join('')}<th class="r">커피</th><th class="r">누적</th><th><span class="sr-only">1위 대비</span></th>`;
      const max = Math.max(1, ...rows.map((s) => s.total));
      const cols = (all ? 6 : 5) + ns.length;
      const none = all ? '아직 등록된 멤버가 없어요.' : `${scope} 멤버가 아직 없어요.`;
      if (!rows.length) {
        $('#board tbody').innerHTML = emptyRow(cols, none);
        $('#board-list').innerHTML = emptyLi(none);
      } else {
        $('#board tbody').innerHTML = rows.map((s) => `
          <tr${s.id === mineId ? ' class="mine"' : ''}>
            <td class="rank${s.total && n(s) <= 3 ? ' top' : ''}">${n(s)}</td>
            <td>${who(s)}</td>
            ${all ? `<td class="muted">${D.groups[s.grp].name}</td>` : ''}
            ${ns.map((x) => `<td class="r">${cell(x, s)}</td>`).join('')}
            <td class="r">${s.coffee ? `${s.coffee}잔` : '<span class="dash">0</span>'}</td>
            <td class="r"><b>${D.fmt(s.total)}</b></td>
            <td style="width:22%"><span class="bar${n(s) === 1 && s.total ? '' : ' quiet'}"><span style="width:${(s.total / max * 100).toFixed(1)}%"></span></span></td>
          </tr>`).join('');
        $('#board-list').innerHTML = rows.map((s) => `
          <li${s.id === mineId ? ' class="mine"' : ''}><span class="who"><b class="rank${s.total && n(s) <= 3 ? ' top' : ''}">${n(s)}</b>${who(s)}</span>
            <span class="r"><b>${D.fmt(s.total)}</b><span class="sub">${all ? `${D.groups[s.grp].name} · ` : ''}${came(s)}회 참여 · 커피 ${s.coffee}잔</span></span></li>`).join('');
      }
      $$('.count').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.view === view)));
    };
    $$('.count').forEach((c) => c.addEventListener('click', () => { view = c.dataset.view; picked = true; draw(); }));
    boot((data, err) => {
      if (err) {
        $('#finding').textContent = err.message === 'not_configured' ? offline : why(err);
        $('#board tbody').innerHTML = emptyRow(8, '기록을 불러오지 못했어요.');
        return;
      }
      R = data;
      const active = R.members.filter((m) => m.active);
      $('#n-all').textContent = `${active.length}명`;
      $('#n-tue').textContent = `${active.filter((m) => m.grp === 'tue').length}명`;
      $('#n-wed').textContent = `${active.filter((m) => m.grp === 'wed').length}명`;
      $('#winners').innerHTML = R.winners.length ? [...R.winners].reverse().map((w) => {
        const s = R.sessions.find((x) => x.n === w.n);
        const line = (g) => {
          const m = R.byId[w[g]];
          if (!m) return `<span class="win faint">${D.weekday[g]} 기록 없음</span>`;
          return `<span class="win">${D.weekday[g]} ${who(m)} <b class="num">${D.fmt(R.room[R.key(w.n, g)][m.id])}</b>${w.overall === m.id ? ' <span class="pill accent">종합 1등</span>' : ''}</span>`;
        };
        return `<li><span><b>${w.n}회차</b><span class="sub">${s ? D.day(D.first(s)) : ''}</span></span><span class="wins">${line('tue')}${line('wed')}</span></li>`;
      }).join('') : emptyLi('확정된 배틀이 생기면 회차마다 그룹 1등이 여기에 남아요.');
      draw();
    }, ['battles', 'submissions', 'members']);
  }

  // ---------- 회차 ----------
  // The two groups read different articles, so the page shows one group at a time: the member's own group,
  // or for visitors, the group that meets next in this session.
  if (page === 'sessions') {
    let R = null, me = null, grp = null;
    const picks = $$('[data-grp]');
    // Sentences for a reading session stay open until that group's next session starts.
    const deadline = (s, g) => {
      const nx = R.sessions.find((x) => x.n > s.n && x[`${g}_date`]);
      if (!nx) return null;
      const date = nx[`${g}_date`];
      return { next: nx, date, time: D.groups[g].start, wd: D.weekday[g], at: new Date(`${date}T${D.groups[g].start}:00+09:00`) };
    };
    // Each group's title, or one title when every group that met read the same article.
    const titles = (s) => {
      const all = D.articles(s), named = all.filter((a) => a.title);
      if (!named.length) return null;
      if (named.length === all.length && new Set(named.map((a) => a.title)).size === 1) return `<span lang="en">${esc(named[0].title)}</span> <span class="faint">${esc(named[0].type || '')}</span>`;
      return named.map((a) => `<span class="faint">${D.weekday[a.grp]}</span> <span lang="en">${esc(a.title)}</span>`).join('<br>');
    };

    const draw = () => {
      const cur = R.current;
      $('#grp-pick').hidden = !cur;
      if (!cur) {
        fill('#obj-title', '아직 등록된 회차가 없어요');
        fill('#obj-meta', '관리자가 첫 회차를 만들면 여기에 보여요.');
        $('#obj-actions').hidden = true;
        $('#now').hidden = true;
        return;
      }
      $('#obj-actions').hidden = false;
      $('#now').hidden = false;
      const G = D.groups[grp];
      const date = cur[`${grp}_date`];
      picks.forEach((b) => {
        const g = b.dataset.grp, d = cur[`${g}_date`];
        b.setAttribute('aria-pressed', String(g === grp));
        $('b', b).textContent = d ? `${D.day(d)} ${D.groups[g].start}` : '이번 회차 쉬어요';
      });
      const dict = cur.kind === 'dictation';
      const art = D.article(cur, grp);
      const isOpen = (s) => { const d = deadline(s, grp); return !d || Date.now() < d.at.getTime(); };
      const mine = me && me.member_id ? R.byId[me.member_id] : null;
      const other = !!mine && mine.grp !== grp; // a member on the other group's article, e.g. the day they went there
      $('#obj-cover').src = dict ? 'assets/blind-typist-miss-cora-filton-lccn2016878328.jpg' : 'assets/reader-square.jpg';
      // A reading session is named by the group's article; the kind moves to the line under it.
      const titled = !dict && art && art.title;
      fill('#obj-title', titled ? `${cur.n}회차 · <span lang="en">${esc(art.title)}</span>` : `${cur.n}회차 · ${kindName(cur.kind)}`);
      fill('#obj-meta', esc(date
        ? `${titled ? `${kindName(cur.kind)} · ` : ''}${G.name} 그룹 ${D.day(date)} ${G.start} · 정석학술정보관 스터디룸`
        : `${G.name} 그룹은 이번 회차에 모이지 않아요. ${D.when(cur)}`));
      fill('#obj-actions', dict
        ? '<a class="btn" href="/dashboard">대시보드</a><a class="btn btn-primary" href="/battle">배틀 입장</a>'
        : !date ? ''
        : `${art.url ? `<a class="btn" href="${esc(art.url)}" rel="noopener">원문 읽기</a>` : ''}${isOpen(cur) ? '<a class="btn btn-primary" href="#last-title">문장 남기기</a>' : '<span class="closed-note">문장 받기가 마감됐어요</span>'}`);

      // Three figures about this session, for the group on show.
      const inGroup = (m) => m.grp === grp;
      // Who came to this group's meeting, including members of the other group who came that day.
      const came = R.present(cur.n, grp);
      const guests = came.filter((m) => !inGroup(m)).length;
      const said = R.sentences.filter((x) => x.session_n === cur.n && x.grp === grp);
      const active = R.members.filter((m) => m.active && inGroup(m)).length;
      const due = deadline(cur, grp);
      $('#kpis').innerHTML = dict
        ? `<div><dt>라운드</dt><dd>${cur.rounds}<small>라운드</small></dd><p class="cap">클립마다 진행자 스피커로 2번</p></div>
           <div><dt>참여한 멤버</dt><dd>${came.length}<small>/ ${active}명</small></dd><p class="cap">${G.name} 모임${guests ? ` · 다른 그룹 ${guests}명 포함` : ''} · 배틀에 입장하면 자동으로 체크돼요</p></div>
           <div><dt>정답 공개</dt><dd>${D.day(D.last(cur))}</dd><p class="cap">${cur.wed_date ? '수요일' : '화요일'} 모임이 끝난 뒤</p></div>`
        : `<div><dt>원문</dt><dd>${art && art.type ? esc(art.type) : '–'}<small>${art && art.minutes ? `${art.minutes}분` : ''}</small></dd><p class="cap">${!date ? '이번 회차에 모이지 않아요' : art.title ? '읽는 시간 기준' : '관리자가 곧 올려요'}</p></div>
           <div><dt>남긴 문장</dt><dd>${said.length}<small>/ ${active}명</small></dd><p class="cap">${G.name} 그룹</p></div>
           <div><dt>문장 마감</dt><dd>${date && due ? D.day(due.date) : '–'}</dd><p class="cap">${!date ? '이번 회차에 모이지 않아요' : !due ? '다음 회차가 정해지면 그 시작 전까지' : isOpen(cur) ? `${due.next.n}회차 시작(${due.wd} ${due.time}) 전까지` : `${due.next.n}회차가 시작되면서 마감됐어요`}</p></div>`;

      // The reading session whose sentences to show: this one, or this group's last one.
      const reading = cur.kind === 'reading' && date ? cur : [...R.sessions].reverse().find((s) => s.kind === 'reading' && s.n < cur.n && s[`${grp}_date`]);
      if (!reading) {
        fill('#last-title', '남긴 문장');
        fill('#last-meta', `${G.name} 그룹`);
        fill('#sentences', emptyLi(`${G.name} 그룹의 Reading 회차가 생기면 멤버들이 고른 문장이 여기에 모여요.`));
        $('#write').hidden = true; $('#write-login').hidden = true; $('#write-closed').hidden = true;
      } else {
        const ra = D.article(reading, grp);
        fill('#last-title', reading.n === cur.n && ra.title ? `${G.name} 그룹이 남긴 문장` : `${reading.n}회차 ${G.name} 그룹 원문 · ${ra.title ? `<span lang="en">${esc(ra.title)}</span>` : '제목 미정'}`);
        fill('#last-meta', esc([ra.type, ra.minutes ? `읽는 데 ${ra.minutes}분` : ''].filter(Boolean).join(' · ')));
        const list = R.sentences.filter((x) => x.session_n === reading.n && x.grp === grp && R.byId[x.member_id]);
        fill('#sentences', list.length ? list.map((x) => `<li><blockquote lang="en">${esc(x.body)}</blockquote>${x.reason ? `<p class="muted">${esc(x.reason)}</p>` : ''}${who(R.byId[x.member_id])}</li>`).join('') : emptyLi('아직 남긴 문장이 없어요.'));
        const open = isOpen(reading);
        const shut = deadline(reading, grp);
        $('#write-closed').hidden = open;
        if (!open) $('#write-closed').textContent = `${D.day(shut.date)} ${shut.time}, ${shut.next.n}회차가 시작되면서 문장 받기가 마감됐어요.`;
        $('#write').hidden = !open || !mine;
        $('#write-login').hidden = !open || !!(me && me.member_id);
        if (open && me && !me.member_id) {
          $('#write-login-text').textContent = '로그인한 번호가 아직 멤버 명단과 연결되지 않았어요. 관리자에게 말해 주세요.';
          $('#write-login [data-login]').hidden = true;
        }
        // A member may leave a sentence on the other group's article too, when they went to that meeting.
        if (open && mine) {
          const left = list.find((x) => x.member_id === mine.id);
          $('#w-who').innerHTML = `<b>${esc(mine.name)}</b> 님으로 ${other ? `${G.name} 그룹 원문에 ` : ''}남겨요.${left ? ' 이미 남긴 문장이 있어서, 다시 내면 바뀌어요.' : ''}${shut ? ` ${D.day(shut.date)} ${shut.time}, ${shut.next.n}회차가 시작되기 전까지 남길 수 있어요.` : ''}`;
          $('#write').onsubmit = async (e) => {
            e.preventDefault();
            const msg = $('#w-msg');
            try {
              await D.rpc('leave_sentence', { p_session: reading.n, p_grp: grp, p_body: $('#w-body').value, p_reason: $('#w-reason').value });
              msg.textContent = '남겼어요. 다시 내면 바뀌어요.';
              $('#w-body').value = ''; $('#w-reason').value = '';
            } catch (er) { msg.textContent = /check/.test(er.message) ? '문장은 3자 이상 400자 이하로 적어 주세요.' : er.message === 'not_signed_in' ? RELOGIN : why(er); }
          };
        }
      }

      // This group's next session.
      const next = R.sessions.filter((s) => s.n > cur.n && s[`${grp}_date`]);
      const nx = next[0], na = nx && D.article(nx, grp);
      fill('#next-title', nx ? `${nx.n}회차 · ${kindName(nx.kind)}` : '아직 정해지지 않았어요');
      fill('#next-when', nx ? `${G.name} 그룹 ${D.day(nx[`${grp}_date`])} ${G.start}` : `관리자가 ${G.name} 그룹의 다음 회차를 만들면 여기에 보여요.`);
      fill('#next-text', nx && nx.kind === 'reading'
        ? (na.title ? `<span lang="en">${esc(na.title)}</span>` : '<span class="faint">원문이 아직 올라오지 않았어요. 모임 일주일 전까지 올라와요.</span>')
        : nx ? `<span class="faint">${nx.rounds}라운드 배틀이에요.</span>` : '<span class="faint">–</span>');

      fill('#all tbody', [...R.sessions].reverse().map((s) => {
        const state = s.n === cur.n ? '<span class="pill accent">이번 주</span>' : (D.last(s) > R.today ? '<span class="pill">예정</span>' : '<span class="faint">끝남</span>');
        let what = '<span class="faint">–</span>';
        if (s.kind === 'reading') what = titles(s) || what;
        const w = R.winners.find((x) => x.n === s.n);
        if (s.kind === 'dictation' && w) what = `1등 화 ${esc(R.byId[w.tue]?.name || '–')} · 수 ${esc(R.byId[w.wed]?.name || '–')}`;
        else if (s.kind === 'dictation' && s.answers_public_at && new Date(s.answers_public_at) > new Date()) what = '<span class="faint">정답은 마지막 모임 뒤 공개</span>';
        const ppl = R.present(s.n);
        const attend = ppl.length ? `<span title="${esc(ppl.map((m) => m.name).join(', '))}">${ppl.length}명</span>` : '<span class="faint">–</span>';
        return `<tr><td><b>${s.n}회차</b></td><td class="num">${D.days(s)}</td><td>${s.kind === 'reading' ? 'Reading' : 'Dictation'}</td><td class="wrap">${what}</td><td class="r">${attend}</td><td class="r">${state}</td></tr>`;
      }).join('') || emptyRow(6, '아직 등록된 회차가 없어요.'));
    };

    picks.forEach((b) => b.addEventListener('click', () => { grp = b.dataset.grp; if (R) draw(); }));
    boot(async (data, err) => {
      if (err) { fill('#obj-title', '회차'); fill('#obj-meta', esc(err.message === 'not_configured' ? offline : why(err))); return; }
      R = data;
      me = await D.me();
      if (!grp) {
        const mem = me && me.member_id && R.byId[me.member_id];
        const cur = R.current;
        grp = mem ? mem.grp
          : !cur || (cur.tue_date && cur.tue_date >= R.today) || !cur.wed_date ? 'tue' : 'wed';
      }
      draw();
    }, ['sessions', 'sentences', 'battle_joins', 'battles', 'attendance']);
  }

  // ---------- 내 정보 ----------
  if (page === 'me') {
    let redraw = null;
    // The landing's 로그인 link lands here as /me#login: open the login box straight away.
    const wantLogin = location.hash === '#login';
    if (wantLogin) history.replaceState(null, '', location.pathname + location.search);
    const gate = (text, admin) => {
      $('#me-gate').hidden = false; $('#me-body').hidden = true;
      if (text) {
        $('#gate-title').textContent = '아직 멤버 명단과 연결되지 않았어요';
        $('#gate-text').textContent = text;
        $('#me-gate [data-login]').hidden = true;
      }
      if (admin) $('#me-gate > div').innerHTML = '<button type="button" class="btn btn-primary" id="gate-admin">관리자 열기</button>';
      const b = $('#gate-admin'); if (b) b.addEventListener('click', () => openAdmin('manage'));
    };
    boot(async (R, err) => {
      if (err) { fill('#me-sub', esc(err.message === 'not_configured' ? offline : why(err))); return; }
      const me = await D.me();
      if (!me) { fill('#me-sub', '로그인하면 내 기록을 모아서 보여 줘요.'); gate(); if (wantLogin) openLogin(); return; }
      const m = me.member_id && R.byId[me.member_id];
      if (!m) {
        fill('#me-sub', `휴대폰 끝자리 ${esc(me.last4 || '')}로 로그인했어요.`);
        gate(me.is_admin ? '관리자 → 멤버 명단에서 내 이름과 이 번호를 한 줄로 추가하면, 문장을 남기고 배틀에 참가할 수 있어요.' : '운영진에게 이 번호를 멤버 명단에 넣어 달라고 말해 주세요.', me.is_admin);
        return;
      }
      $('#me-gate').hidden = true; $('#me-body').hidden = false;
      const g = D.groups[m.grp];
      const dateOf = (s) => s[m.grp + '_date'];
      fill('#me-face', `<span class="who" aria-hidden="true"><i style="--h:${m.hue}">${esc(m.name[0])}</i></span>`);
      fill('#me-title', esc(m.name));
      fill('#me-sub', esc(`${g.name} 그룹 · 매주 ${g.name} ${g.time} · 휴대폰 끝자리 ${me.last4 || '–'}${me.is_admin ? ' · 운영진' : ''}${m.active ? '' : ' · 쉬는 중'}`));

      // Four figures: how often I came, my score, where it puts me, and coffee won.
      const mine = new Set(R.attendance.filter((a) => a.member_id === m.id).map((a) => a.session_n));
      const held = R.sessions.filter((s) => dateOf(s) && dateOf(s) <= R.today);
      // Sessions I came to my own group's meeting, and sessions I only came to the other group's.
      const own = R.sessions.filter((s) => R.cameTo(s.n, m.id).includes(m.grp)).length;
      const away = R.sessions.filter((s) => { const w = R.cameTo(s.n, m.id); return w.length && !w.includes(m.grp); }).length;
      const st = R.standings.find((x) => x.id === m.id);
      const gr = R.groupRank(m.grp);
      const grow = gr.find((x) => x.id === m.id);
      const scored = !!(st && st.total);
      $('#me-kpis').innerHTML = `
        <div><dt>참여</dt><dd>${mine.size}<small>회</small></dd><p class="cap">${away ? `우리 그룹 모임 ${own}번 · 다른 요일 ${away}번` : held.length ? `우리 그룹 모임 ${held.length}번 중` : '아직 열린 모임이 없어요'}</p></div>
        <div><dt>누적 점수</dt><dd>${scored ? D.fmt(st.total) : '–'}<small>${scored ? '점' : ''}</small></dd><p class="cap">확정된 배틀 ${R.battleNs.length}번 합계</p></div>
        <div><dt>순위</dt><dd>${scored ? `${grow.grank}<small>위 / ${gr.length}명</small>` : '–'}</dd><p class="cap">${scored ? `${g.name} 그룹 · 종합 ${st.rank}위` : '첫 배틀이 확정되면 생겨요'}</p></div>
        <div><dt>커피</dt><dd>${st ? st.coffee : 0}<small>잔</small></dd><p class="cap">모임 배틀 1등 한 번에 한 잔</p></div>`;

      // My battles, one row per confirmed session.
      const rows = R.battleNs.map((n) => {
        const t = R.totals[n];
        const s = R.sessions.find((x) => x.n === n);
        // The battle that counts for me: my group's, or the other group's when I only played there.
        const played = R.subs.filter((x) => x.session_n === n && x.member_id === m.id).map((x) => x.grp);
        const bg = (R.from[n] || {})[m.id] || (played.includes(m.grp) ? m.grp : played[0]) || m.grp;
        const bt = R.battles.find((x) => x.session_n === n && x.grp === bg);
        const myRounds = R.subs.filter((x) => x.session_n === n && x.grp === bg && x.member_id === m.id).sort((p, q) => p.round - q.round);
        const where = s ? (bg === m.grp ? D.days(s) : `${D.weekday[bg]} ${D.day(s[`${bg}_date`])} · 다른 요일`) : '';
        const day = `<td><b>${n}회차</b></td><td class="num muted">${where}</td>`;
        if (t[m.id] == null && bt && !bt.confirmed_at && myRounds.length) return `<tr>${day}<td>${strip(myRounds, s ? s.rounds : 8, bt)}</td><td class="r faint">${D.fmt(myRounds.reduce((a, x) => a + x.total, 0))}</td><td class="r dash">–</td><td class="r"><span class="pill">${bt.status === 'finished' ? '확정 전' : '진행 중'}</span></td></tr>`;
        if (t[m.id] == null) return `<tr>${day}<td><span class="dash">${bt ? '불참' : '우리 그룹 배틀 없음'}</span></td><td class="r dash">–</td><td class="r dash">–</td><td class="r"></td></tr>`;
        const same = Object.keys(t).filter((id) => R.byId[id] && R.byId[id].grp === m.grp).sort((a, b) => t[b] - t[a]);
        const place = same.filter((id) => t[id] > t[m.id]).length + 1;
        const w = R.winners.find((x) => x.n === n) || {};
        // Coffee is per meeting; name the day when I won a battle other than the one shown here.
        const won = ['tue', 'wed'].filter((g) => w[g] === m.id).map((g) => `<span class="pill accent">${g === bg ? '' : `${D.weekday[g]} `}모임 1등</span>`).join(' ');
        return `<tr>${day}<td>${strip(myRounds, s ? s.rounds : 8, bt)}</td><td class="r"><b>${D.fmt(t[m.id])}</b></td><td class="r">${place}위 <span class="faint">/ ${same.length}명</span></td><td class="r">${won}</td></tr>`;
      });
      fill('#battles tbody', rows.join('') || emptyRow(6, '확정된 배틀이 생기면 회차마다 내 점수가 여기에 쌓여요.'));
      fill('#battles-key', rows.length ? stripKey : '');

      // Sentences I left.
      const said = R.sentences.filter((x) => x.member_id === m.id).sort((a, b) => b.session_n - a.session_n);
      fill('#said-meta', said.length ? `${said.length}개` : '');
      fill('#said', said.length ? said.map((x) => {
        const a = D.article(R.sessions.find((y) => y.n === x.session_n), x.grp);
        return `<li><span class="sub">${x.session_n}회차${a && a.title ? ` · <span lang="en">${esc(a.title)}</span>` : ''}</span><blockquote lang="en">${esc(x.body)}</blockquote>${x.reason ? `<p class="muted">${esc(x.reason)}</p>` : ''}</li>`;
      }).join('') : emptyLi('Reading 회차에서 인상 깊은 문장을 남기면 여기에 모여요.'));

      // My group's next meeting.
      const next = R.sessions.find((s) => dateOf(s) && dateOf(s) >= R.today);
      fill('#me-next', next
        ? `<h3>${next.n}회차 · ${kindName(next.kind)}</h3><p>${g.name} ${D.day(dateOf(next))} ${g.start} · 정석학술정보관 스터디룸</p>${next.kind === 'reading'
          ? (D.article(next, m.grp).title ? `<p><span lang="en">${esc(D.article(next, m.grp).title)}</span></p>` : '<p class="faint">원문이 아직 올라오지 않았어요.</p>') + `<a class="btn" href="/sessions#last-title">${said.some((x) => x.session_n === next.n) ? '남긴 문장 고치기' : '문장 남기기'}</a>`
          : '<a class="btn" href="/battle">배틀 입장</a>'}`
        : `<p class="faint" style="margin:0">${g.name} 그룹의 다음 모임이 아직 정해지지 않았어요.</p>`);

      // Sessions my group met, ticked when I came.
      const mineSessions = R.sessions.filter((s) => dateOf(s) || mine.has(s.n)).reverse();
      fill('#me-came', mineSessions.length ? mineSessions.map((s) => {
        const went = R.cameTo(s.n, m.id);
        const other = went.find((x) => x !== m.grp);
        const d = (went.length && !went.includes(m.grp) ? s[`${other}_date`] : dateOf(s)) || s[`${went[0]}_date`];
        const mark = went.length > 1 ? '<span class="pill positive">두 모임 참여</span>'
          : other ? `<span class="pill positive">${D.weekday[other]} 모임 참여</span>`
          : went.length ? '<span class="pill positive">참여</span>'
          : d > R.today ? '<span class="faint">예정</span>' : '<span class="faint">불참</span>';
        return `<li><span><b>${s.n}회차</b><span class="sub">${s.kind === 'reading' ? 'Reading' : 'Dictation'} · ${D.day(d)}</span></span>${mark}</li>`;
      }).join('') : emptyLi('우리 그룹 회차가 생기면 여기에 보여요.'));

      // Change my own display name.
      const input = $('#me-name');
      if (document.activeElement !== input) input.value = m.name;
      $('#rename').onsubmit = async (e) => {
        e.preventDefault();
        const msg = $('#rename-msg');
        const v = input.value.trim();
        if (!v) { msg.textContent = ERR.length; return; }
        if (v === m.name) { msg.textContent = '지금 이름과 같아요.'; return; }
        const btn = $('#rename [type=submit]');
        btn.disabled = true;
        try {
          await D.rpc('member_rename', { p_name: v });
          msg.textContent = `바꿨어요. 이제 ${v} 님으로 보여요.`;
          D.forget();
          await account();
          if (redraw) await redraw();
        } catch (er) { msg.textContent = er.message === 'not_signed_in' ? RELOGIN : why(er); }
        btn.disabled = false;
      };
    }, ['members', 'attendance', 'battles', 'submissions', 'sentences']).then((run) => { redraw = run; });
  }

  // ---------- 배틀 대시보드 (프로젝터) ----------
  if (page === 'dashboard') {
    let tick = 0;
    const adminP = D.isAdmin();
    boot(async (R, err) => {
      if (err) { fill('#d-finding', esc(err.message === 'not_configured' ? offline : why(err))); return; }
      const qs = new URLSearchParams(location.search);
      const b = qs.get('s') ? R.battles.find((x) => x.session_n === Number(qs.get('s')) && x.grp === (qs.get('g') || 'tue')) : R.liveBattle;
      if (!b) {
        fill('#d-what', '진행 중인 배틀이 없어요');
        fill('#d-finding', '배틀이 열리면 여기에 순위가 떠요');
        fill('#d-board', emptyLi('진행자가 배틀을 열고 멤버가 입장하면 이름이 하나씩 올라와요.'));
        return;
      }
      const s = R.sessions.find((x) => x.n === b.session_n);
      const board = R.board(b);
      fill('#d-what', esc(`${b.session_n}회차 Dictation Battle · ${D.groups[b.grp].name} 그룹 · `) + `<span>라운드 ${b.current_round || 0} / ${s ? s.rounds : '–'}</span>`);
      if (await adminP) {
        const { data } = await D.sb.from('battle_codes').select('code').eq('session_n', b.session_n).eq('grp', b.grp).maybeSingle();
        fill('#d-code', data ? data.code : '–');
        $('#d-code-wrap').hidden = false;
      }
      const [a, c] = board;
      fill('#d-finding', !a || !a.total ? `${board.length}명 입장했어요. 첫 라운드를 기다리는 중이에요` : c && a.total === c.total ? `${esc(wa(a.name))} ${esc(c.name)}, 같은 점수예요` : c ? `${esc(ga(a.name))} ${esc(c.name)}보다 ${a.total - c.total}점 앞서요` : `${esc(ga(a.name))} 1위예요`);
      const max = Math.max(1, ...board.map((x) => x.total));
      fill('#d-board', board.length ? board.map((x, i) => `
        <li class="${i === 0 && x.total ? 'lead' : ''}"><span class="d-rank">${i + 1}</span>${who(x)}${strip(x.rounds, s ? s.rounds : 8, b)}
          <span class="bar${i === 0 && x.total ? '' : ' quiet'}"><span style="width:${(x.total / max * 100).toFixed(1)}%"></span></span>
          <b class="num">${x.total}</b></li>`).join('') : emptyLi('아직 입장한 멤버가 없어요.'));
      const absent = R.members.filter((m) => m.active && m.grp === b.grp && !board.some((x) => x.id === m.id));
      fill('#d-key', board.length ? stripKey : '');
      fill('#d-absent', absent.length ? esc(`아직 입장 안 함: ${absent.map((m) => m.name).join(', ')}`) : '');

      const shown = b.status === 'open' ? b.current_round - 1 : b.current_round;
      let script = null;
      if (shown >= 1) {
        const { data } = await D.sb.from('clips').select('script').eq('session_n', b.session_n).eq('grp', b.grp).eq('round', shown).maybeSingle();
        script = data && data.script;
      }
      fill('#d-prev-title', shown >= 1 ? `라운드 ${shown} 정답` : '정답');
      fill('#d-script', script ? esc(script) : `<span class="faint">${shown >= 1 ? '정답은 관리자로 로그인한 화면에서 보여요.' : '첫 라운드가 끝나면 정답이 여기에 떠요.'}</span>`);
      const roundRows = shown >= 1 ? R.subs.filter((x) => x.session_n === b.session_n && x.grp === b.grp && x.round === shown) : [];
      fill('#d-missed', roundRows.length ? `평균 정확도 ${Math.round(roundRows.reduce((p, x) => p + x.accuracy, 0) / roundRows.length)}%, ${roundRows.length}명 제출` : '');
      const streaks = board.filter((x) => x.streak >= 1).sort((p, q) => q.streak - p.streak);
      fill('#d-streaks', streaks.length ? streaks.map((x) => `<li>${who(x)}<b class="num">${x.streak}연속</b></li>`).join('') : emptyLi('정확도 95% 이상을 연달아 내면 여기에 떠요.'));
      fill('#d-dots', Array.from({ length: s ? s.rounds : 0 }, (_, i) => `<li class="${i + 1 < b.current_round || (i + 1 === b.current_round && b.status !== 'open') ? 'done' : i + 1 === b.current_round ? 'now' : ''}" aria-label="라운드 ${i + 1}">${i + 1}</li>`).join(''));
      clearInterval(tick);
      const clock = () => {
        if (b.status !== 'open' || !b.round_started_at) { fill('#d-dots-note', b.status === 'finished' ? '배틀이 끝났어요.' : b.status === 'closed' ? `라운드 ${b.current_round} 채점 끝. 다음 라운드를 기다리는 중이에요.` : '진행자가 라운드를 시작하면 시간이 흘러요.'); return; }
        const left = Math.max(0, 20 - (Date.now() - new Date(b.round_started_at).getTime()) / 1000);
        fill('#d-dots-note', `라운드 ${b.current_round} 남은 시간 ${Math.ceil(left)}초`);
      };
      clock(); tick = setInterval(clock, 500);
    }, ['battles', 'submissions', 'battle_joins']);
  }

  // ---------- 배틀 참여 (휴대폰) ----------
  if (page === 'battle') {
    const show = (id) => {
      $$('[data-step]').forEach((el) => { el.hidden = el.dataset.step !== id; });
      if (id !== 'play') $('#b-title').textContent = '배틀 입장';
    };
    const err = $('#code-error');
    let state = JSON.parse(sessionStorage.getItem('rt-battle') || 'null'); // { code, session_n, grp }
    let tick = 0, mine = {}, me = null;
    const save = () => sessionStorage.setItem('rt-battle', JSON.stringify(state));

    if (!D.ready) { err.textContent = offline; $('#join button[type=submit]').disabled = true; show('join'); return; }

    const playStep = async () => {
      show('play');
      const R = await D.load();
      const b = R.battles.find((x) => x.session_n === state.session_n && x.grp === state.grp);
      const s = R.sessions.find((x) => x.n === state.session_n);
      const mem = R.byId[me.member_id];
      if (!b || !mem) { sessionStorage.removeItem('rt-battle'); state = null; show('join'); return; }
      const board = R.board(b);
      const rank = board.findIndex((x) => x.id === mem.id) + 1;
      const meRow = board.find((x) => x.id === mem.id);
      $('#b-title').textContent = `${b.session_n}회차 배틀 · ${D.groups[b.grp].name} 그룹`;
      $('#p-name').innerHTML = who(mem);
      $('#p-round').textContent = `라운드 ${b.current_round || 0} / ${s ? s.rounds : '–'}`;
      $('#p-standing').textContent = meRow && meRow.total ? `지금 ${rank}위 · ${meRow.total}점` : '첫 라운드부터 점수가 쌓여요';
      $('#p-strip').innerHTML = strip(meRow ? meRow.rounds : [], s ? s.rounds : 8, b);
      $('#p-key').innerHTML = stripKey;
      const sub = R.subs.find((x) => x.session_n === b.session_n && x.grp === b.grp && x.round === b.current_round && x.member_id === mem.id);
      const form = $('#play');
      clearInterval(tick);
      if (b.status === 'finished') {
        $('#p-state').textContent = `배틀이 끝났어요. 오늘 ${meRow ? meRow.total : 0}점이에요.`;
        form.querySelector('textarea').disabled = true; form.querySelector('[type=submit]').disabled = true;
        $('#p-timer').textContent = '끝';
        return;
      }
      if (b.status !== 'open' || !b.current_round) {
        form.querySelector('textarea').disabled = true; form.querySelector('[type=submit]').disabled = true;
        $('#p-timer').textContent = '대기';
        if (b.status === 'closed' && b.current_round) {
          const script = await D.rpc('round_script', { p_code: state.code, p_round: b.current_round });
          const r = sub || mine[b.current_round];
          $('#p-state').innerHTML = `라운드 ${b.current_round} 끝. ${r ? `정확도 ${r.accuracy}%, 속도 +${r.speed}, 연속 +${r.bonus}, <b>${r.total}점</b>.` : '이번 라운드는 내지 못했어요.'}${script ? `<br><span class="faint">정답:</span> <span lang="en">${esc(script)}</span>` : ''}`;
        } else {
          $('#p-state').textContent = '진행자가 라운드를 시작하면 입력칸이 열려요.';
        }
        return;
      }
      if (sub) {
        $('#p-state').innerHTML = `냈어요. 정확도 ${sub.accuracy}%, 속도 +${sub.speed}, 연속 +${sub.bonus}, <b>${sub.total}점</b>. 라운드가 끝나면 정답이 떠요.`;
        form.querySelector('textarea').disabled = true; form.querySelector('[type=submit]').disabled = true;
      } else {
        $('#p-state').textContent = '진행자 스피커로 클립을 두 번 들려줘요. 들은 그대로 입력하세요.';
        form.querySelector('textarea').disabled = false; form.querySelector('[type=submit]').disabled = false;
      }
      const clock = () => {
        const left = Math.max(0, 20 - (Date.now() - new Date(b.round_started_at).getTime()) / 1000);
        $('#p-timer').textContent = `0:${String(Math.ceil(left)).padStart(2, '0')}`;
      };
      clock(); tick = setInterval(clock, 250);
    };

    $('#join').addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const code = $('#code').value.trim();
      try {
        const info = await D.rpc('join_battle', { p_code: code });
        state = { code, session_n: info.session_n, grp: info.grp };
        save();
        await playStep();
      } catch (er) { err.textContent = er.message === 'not_signed_in' ? RELOGIN : why(er); }
    });
    $('#play').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#play [type=submit]');
      btn.disabled = true;
      try {
        const r = await D.rpc('submit_answer', { p_code: state.code, p_typed: $('#answer').value });
        mine[r.round] = r;
        $('#answer').value = '';
        await playStep();
      } catch (er) { $('#p-state').textContent = er.message === 'not_signed_in' ? RELOGIN : why(er); btn.disabled = false; }
    });
    $('#leave').addEventListener('click', () => { sessionStorage.removeItem('rt-battle'); location.reload(); });

    (async () => {
      me = await D.me();
      if (!me) { show('login'); return; }
      if (!me.member_id) { show('login'); $('#need-login-text').textContent = '로그인한 번호가 아직 멤버 명단과 연결되지 않았어요. 관리자에게 말해 주세요.'; $$('#need-login [data-login]').forEach((b) => { b.hidden = true; }); return; }
      $('#join-who').innerHTML = `<b>${esc(me.name)}</b> 님으로 입장해요.`;
      D.watch(['battles', 'submissions'], () => { if (state && document.body.dataset.page === page) playStep(); });
      if (state) playStep(); else show('join');
    })();
  }
})();
