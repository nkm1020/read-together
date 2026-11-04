// Read Together — the organiser screens. They have no address of their own: app.js loads this file and opens
// them in place when an organiser picks 관리자 from the menu. What they may change is decided by the database.
window.RTAdmin = (() => {
  const D = window.DB;
  const U = window.RTUI;
  const { $, $$, esc, who, why, wa, emptyRow, emptyLi, RELOGIN } = U;
  let stopWatch = () => {};
  let hostTick = 0;

  const shell = (view) => `
    <div class="title-row">
      <div><h1>관리자</h1><p class="sub" id="admin-status">불러오는 중이에요.</p></div>
      <a class="btn" href="${esc(location.pathname)}">관리자 화면 닫기</a>
    </div>
    <nav class="tabs" aria-label="관리자 메뉴">
      <button type="button" data-view="manage"${view === 'manage' ? ' aria-current="page"' : ''}>운영</button>
      <button type="button" data-view="host"${view === 'host' ? ' aria-current="page"' : ''}>배틀 진행</button>
    </nav>
    <div id="admin-view"></div>`;

  const MANAGE = `
  <div class="settings">
    <section class="setting" aria-labelledby="s-sessions">
      <div><h2 id="s-sessions">회차</h2><p>홀수 회차는 Reading &amp; Discussion, 짝수 회차는 Dictation Battle이에요. 한 그룹만 모이는 주에는 다른 날짜를 비워 두세요. Reading 회차는 화요일과 수요일 그룹 원문을 따로 넣어요. 참여한 멤버는 회차마다 체크해요.</p></div>
      <div class="panel">
        <div class="table-frame">
          <table class="data" id="sessions-table">
            <thead><tr><th>회차</th><th>종류</th><th>날짜</th><th>원문 또는 라운드</th><th class="r">참여</th><th class="r"><span class="sr-only">고치기</span></th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <form id="attend" class="nested stack" hidden>
          <h3 id="attend-title" style="font-size:15px;font-weight:600">참여 멤버</h3>
          <p class="muted" style="margin:0;font-size:13px">배틀에 입장한 멤버는 자동으로 체크돼요.</p>
          <div id="attend-list" class="attend-list"></div>
          <div class="panel-foot"><p class="muted" id="attend-msg" role="status"></p><button type="button" class="btn" id="attend-close">닫기</button><button type="submit" class="btn btn-primary">참여 저장</button></div>
        </form>
        <form id="session-form" class="nested stack">
          <h3 id="session-form-title" style="font-size:15px;font-weight:600">새 회차</h3>
          <div class="two">
            <div class="field"><label for="f-n">회차 번호</label><input class="input num" id="f-n" name="n" type="number" min="1" required></div>
            <div class="field"><span class="label">종류</span><div class="radios"><label><input type="radio" name="kind" value="reading"> Reading</label><label><input type="radio" name="kind" value="dictation"> Dictation</label></div></div>
          </div>
          <div class="two">
            <div class="field"><label for="f-tue">화요일 그룹 날짜</label><input class="input num" id="f-tue" name="tue" type="date" aria-describedby="date-hint"></div>
            <div class="field"><label for="f-wed">수요일 그룹 날짜</label><input class="input num" id="f-wed" name="wed" type="date" aria-describedby="date-hint"></div>
          </div>
          <p class="muted" id="date-hint" style="margin:0;font-size:13px">한 그룹만 모이는 주에는 다른 날짜를 비워 두세요. 둘 중 하나는 있어야 해요.</p>
          <div id="reading-fields" class="stack">
            <div class="stack art" data-art="tue">
              <div class="art-head"><p class="label" style="margin:0">화요일 그룹 원문</p></div>
              <div class="field"><label for="f-tue-title">원문 제목</label><input class="input" id="f-tue-title" name="tue_title" lang="en" placeholder="비워 두면 회차 페이지에 '원문 준비 중'으로 보여요"></div>
              <div class="two">
                <div class="field"><label for="f-tue-url">원문 링크</label><input class="input" id="f-tue-url" name="tue_url" type="url" placeholder="https://"></div>
                <div class="two">
                  <div class="field"><label for="f-tue-type">종류</label><select class="input" id="f-tue-type" name="tue_atype"><option>기사</option><option>칼럼</option><option>에세이</option></select></div>
                  <div class="field"><label for="f-tue-min">읽는 시간(분)</label><input class="input num" id="f-tue-min" name="tue_minutes" type="number" min="1" max="60"></div>
                </div>
              </div>
            </div>
            <div class="stack art" data-art="wed">
              <div class="art-head"><p class="label" style="margin:0">수요일 그룹 원문</p><button type="button" class="card-link" id="copy-tue">화요일 원문 그대로 쓰기</button></div>
              <div class="field"><label for="f-wed-title">원문 제목</label><input class="input" id="f-wed-title" name="wed_title" lang="en" placeholder="비워 두면 회차 페이지에 '원문 준비 중'으로 보여요"></div>
              <div class="two">
                <div class="field"><label for="f-wed-url">원문 링크</label><input class="input" id="f-wed-url" name="wed_url" type="url" placeholder="https://"></div>
                <div class="two">
                  <div class="field"><label for="f-wed-type">종류</label><select class="input" id="f-wed-type" name="wed_atype"><option>기사</option><option>칼럼</option><option>에세이</option></select></div>
                  <div class="field"><label for="f-wed-min">읽는 시간(분)</label><input class="input num" id="f-wed-min" name="wed_minutes" type="number" min="1" max="60"></div>
                </div>
              </div>
            </div>
            <p class="muted" id="art-hint" style="margin:0;font-size:13px" hidden>날짜를 넣은 그룹의 원문 칸이 열려요.</p>
          </div>
          <div id="dictation-fields" class="field" hidden><label for="f-rounds">라운드 수</label><input class="input num" id="f-rounds" name="rounds" type="number" min="1" max="20" value="8" style="max-width:8rem"></div>
          <div class="panel-foot" style="justify-content:flex-start"><button type="submit" class="btn btn-primary">회차 저장</button><p class="muted" id="session-msg" role="status"></p></div>
        </form>
      </div>
    </section>

    <section class="setting" aria-labelledby="s-clips">
      <div><h2 id="s-clips">클립과 정답</h2><p>라운드마다 원본 영상·팟캐스트의 출처, 구간, 링크, 정답 스크립트를 적어요. 화요일과 수요일 그룹은 클립을 따로 넣어요. 정답 스크립트로 자동 채점해요.</p></div>
      <div class="panel">
        <div class="two" style="max-width:40rem">
          <div class="field"><label for="clip-session">Dictation 회차</label><select class="input" id="clip-session"></select></div>
          <div class="field"><label for="clip-group">그룹</label><select class="input" id="clip-group"></select></div>
        </div>
        <div class="table-frame">
          <table class="data" id="clips">
            <thead><tr><th>라운드</th><th>출처</th><th>구간</th><th>원본 링크</th><th>정답 스크립트</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="panel-foot"><p class="muted" id="clips-msg" role="status"></p><button type="button" class="btn btn-primary" id="clips-save">클립 저장</button></div>
      </div>
    </section>

    <section class="setting" aria-labelledby="s-members">
      <div><h2 id="s-members">멤버 명단</h2><p>신청 폼에 적힌 휴대폰 번호를 넣으면, 그 멤버는 처음 로그인할 때 비밀번호를 정해요. 비밀번호를 잊으면 초기화하세요. 운영진으로 체크한 멤버는 로그인하면 메뉴에 관리자가 보여요.</p><p id="unlinked" class="muted"></p></div>
      <div class="panel">
        <div class="table-frame">
          <table class="data" id="roster-table">
            <thead><tr><th>표시 이름</th><th>그룹</th><th>휴대폰</th><th>활동</th><th>운영진</th><th>로그인</th><th class="r">참여</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="panel-foot"><p class="muted" id="members-msg" role="status"></p><button type="button" class="btn" id="member-add">한 줄 추가</button><button type="button" class="btn btn-primary" id="members-save">명단 저장</button></div>
      </div>
    </section>

    <section class="setting" aria-labelledby="s-scores">
      <div><h2 id="s-scores">점수 확정</h2><p>배틀이 끝나면 자동 채점 점수를 확인하고 확정해요. 확정한 점수만 누적 랭킹과 커피 기록에 더해져요.</p></div>
      <div class="panel"><ul class="rows" id="scores-list"></ul></div>
    </section>
  </div>`;

  const HOST = `
  <div class="title-row" style="margin-top:4px">
    <div><h2 id="host-title" style="font-size:20px;font-weight:600">배틀 진행</h2><p class="sub" id="host-sub">불러오는 중이에요.</p></div>
    <button type="button" class="btn btn-primary" id="host-action">–</button>
  </div>
  <div class="scope">
    <label class="sr-only" for="pick-session">회차</label><select class="input" id="pick-session"></select>
    <label class="sr-only" for="pick-group">그룹</label><select class="input" id="pick-group"><option value="tue">화요일 그룹</option><option value="wed">수요일 그룹</option></select>
    <span class="code">입장 코드 <b class="num" id="code-value">–</b></span>
    <a class="card-link" href="/dashboard" target="_blank" rel="noopener">프로젝터 화면 열기</a>
  </div>
  <div class="card" id="gate" hidden></div>
  <div class="with-rail" id="console">
    <div class="stack">
      <dl class="kpi" style="--cells:4">
        <div><dt>제출</dt><dd id="h-sub">–</dd><p class="cap">이번 라운드, 입장한 멤버 기준</p></div>
        <div><dt>남은 시간</dt><dd id="h-left" class="num">–</dd><p class="cap">라운드당 20초</p></div>
        <div><dt>재생</dt><dd id="h-plays">–</dd><p class="cap">클립마다 2번까지</p></div>
        <div><dt>지금 1위</dt><dd id="h-lead">–</dd><p class="cap" id="h-lead-cap">–</p></div>
      </dl>
      <section class="card clip" aria-labelledby="clip-title">
        <div class="card-head" style="margin:0"><h2 id="clip-title">클립</h2><span class="meta" id="clip-src">–</span></div>
        <div class="clip-controls">
          <a class="btn" id="clip-open" href="#" target="_blank" rel="noopener" hidden>원본 열기</a>
          <button type="button" class="btn" id="replay">다시 재생 표시</button>
        </div>
        <div class="nested">
          <p class="script-label">정답 스크립트 · 진행자 화면에만 보여요</p>
          <p class="script" lang="en" id="clip-script">–</p>
        </div>
      </section>
      <section class="card" aria-labelledby="last-round-title">
        <div class="card-head"><h2 id="last-round-title">라운드 결과</h2><span class="meta">정확도 + 속도 + 연속 정답</span></div>
        <div class="table-frame">
          <table class="data" id="last-round">
            <thead><tr><th>이름</th><th class="r">정확도</th><th class="r">속도</th><th class="r">연속</th><th class="r">라운드</th><th class="r">누적</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </section>
    </div>
    <aside class="rail" aria-label="진행 상황">
      <h2>입장과 제출</h2>
      <div class="card"><ul class="rows" id="submits"></ul></div>
      <h2>라운드</h2>
      <div class="card"><ul class="rows" id="round-list"></ul></div>
    </aside>
  </div>`;

  // Every write checks the login first; a key reset by another organiser fails here instead of mid-save.
  const guard = async (where) => {
    if (await D.stillIn()) return true;
    if (where) where.textContent = RELOGIN;
    U.openLogin(RELOGIN);
    return false;
  };

  // ---------- 운영 ----------
  async function manage() {
    const sb = D.sb;
    const status = $('#admin-status');
    const say = (el, text) => { el.textContent = text; };
    const R = await D.load();
    const phones = await D.rpc('admin_phones').catch(() => []);
    const phoneOf = Object.fromEntries(phones.filter((p) => p.member_id).map((p) => [p.member_id, p]));
    const next = R.sessions.length ? R.sessions[R.sessions.length - 1].n + 1 : 1;
    const emptyReading = R.sessions.filter((s) => s.kind === 'reading').flatMap((s) => D.articles(s).filter((a) => !a.title && s[`${a.grp}_date`] >= R.today).map((a) => ({ n: s.n, grp: a.grp })))[0];
    const noPhone = R.members.filter((m) => m.active && !phoneOf[m.id]).length;
    status.innerHTML = emptyReading ? `<b>${emptyReading.n}회차 ${D.groups[emptyReading.grp].name} 그룹 원문이 아직 비어 있어요.</b> 모임 일주일 전까지 올려 주세요.`
      : noPhone ? `<b>휴대폰 번호가 없는 멤버가 ${noPhone}명 있어요.</b> 번호가 있어야 로그인해서 문장을 남기고 배틀에 들어올 수 있어요.`
      : R.sessions.length ? `회차 ${R.sessions.length}개, 멤버 ${R.members.filter((m) => m.active).length}명이 등록돼 있어요.` : '<b>아직 아무 기록이 없어요.</b> 멤버 명단과 첫 회차부터 만들어 주세요.';

    // sessions
    $('#sessions-table tbody').innerHTML = [...R.sessions].reverse().map((s) => `<tr><td><b>${s.n}회차</b></td><td>${s.kind === 'reading' ? 'Reading' : 'Dictation'}</td><td class="num">${D.days(s)}</td><td class="wrap">${s.kind === 'reading' ? D.articles(s).map((a) => `${D.weekday[a.grp]} ${a.title ? `<span lang="en">${esc(a.title)}</span>` : '<span class="faint">원문 없음</span>'}`).join('<br>') : `${s.rounds}라운드`}</td><td class="r"><button type="button" class="card-link" data-attend="${s.n}">${R.present(s.n).length}명 체크</button></td><td class="r"><button type="button" class="card-link" data-edit="${s.n}">고치기</button></td></tr>`).join('') || emptyRow(6, '아직 만든 회차가 없어요.');
    const form = $('#session-form');
    const fillForm = (s) => {
      form.n.value = s ? s.n : next;
      form.kind.value = s ? s.kind : (next % 2 ? 'reading' : 'dictation');
      form.tue.value = s ? s.tue_date || '' : '';
      form.wed.value = s ? s.wed_date || '' : '';
      ['tue', 'wed'].forEach((g) => {
        form[`${g}_title`].value = s ? s[`${g}_article_title`] || '' : '';
        form[`${g}_url`].value = s ? s[`${g}_article_url`] || '' : '';
        form[`${g}_atype`].value = s && s[`${g}_article_type`] ? s[`${g}_article_type`] : '기사';
        form[`${g}_minutes`].value = s && s[`${g}_article_minutes`] ? s[`${g}_article_minutes`] : '';
      });
      form.rounds.value = s ? s.rounds : 8;
      $('#session-form-title').textContent = s ? `${s.n}회차 고치기` : '새 회차';
      form.dispatchEvent(new Event('change'));
    };
    fillForm(null);
    $$('[data-edit]').forEach((btn) => btn.addEventListener('click', () => { fillForm(R.sessions.find((s) => s.n === Number(btn.dataset.edit))); form.scrollIntoView({ block: 'center' }); }));
    form.onchange = () => {
      const r = form.kind.value === 'reading';
      $('#reading-fields').hidden = !r; $('#dictation-fields').hidden = r;
      // Only the groups with a date get an article.
      $$('[data-art]', form).forEach((el) => { el.hidden = !form[el.dataset.art].value; });
      $('#art-hint').hidden = !!(form.tue.value || form.wed.value);
      $('#copy-tue').hidden = !form.tue.value;
    };
    $('#copy-tue').onclick = () => { ['title', 'url', 'atype', 'minutes'].forEach((k) => { form[`wed_${k}`].value = form[`tue_${k}`].value; }); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const r = form.kind.value === 'reading';
      const tue = form.tue.value || null, wed = form.wed.value || null;
      if (!tue && !wed) { say($('#session-msg'), '화요일이나 수요일 중 하나는 날짜를 넣어 주세요.'); return; }
      if (tue && wed && wed < tue) { say($('#session-msg'), '수요일 날짜가 화요일보다 앞이에요.'); return; }
      if (!(await guard($('#session-msg')))) return;
      // Each group that meets keeps its own article; a group without a date has none.
      const art = (g, on) => ({
        [`${g}_article_title`]: on ? form[`${g}_title`].value.trim() || null : null,
        [`${g}_article_url`]: on ? form[`${g}_url`].value.trim() || null : null,
        [`${g}_article_type`]: on ? form[`${g}_atype`].value : null,
        [`${g}_article_minutes`]: on && form[`${g}_minutes`].value ? Number(form[`${g}_minutes`].value) : null,
      });
      const row = {
        n: Number(form.n.value), kind: form.kind.value, tue_date: tue, wed_date: wed,
        ...art('tue', r && tue), ...art('wed', r && wed),
        rounds: Number(form.rounds.value) || 8,
        answers_public_at: r ? null : wed ? `${wed}T19:30:00+09:00` : `${tue}T18:00:00+09:00`,
      };
      const { error } = await sb.from('sessions').upsert(row);
      say($('#session-msg'), error ? why(error) : `${row.n}회차를 저장했어요.`);
      if (!error) manage();
    };

    // attendance
    const attend = $('#attend');
    $$('[data-attend]').forEach((btn) => btn.addEventListener('click', () => {
      const n = Number(btn.dataset.attend);
      const s = R.sessions.find((x) => x.n === n);
      const here = new Set(R.present(n).map((m) => m.id));
      const people = R.members.filter((m) => m.active || here.has(m.id));
      const group = (g) => people.filter((m) => m.grp === g).map((m) => `<label class="pick-name"><input type="checkbox" value="${m.id}"${here.has(m.id) ? ' checked' : ''}> ${who(m)}</label>`).join('');
      $('#attend-title').textContent = `${n}회차 참여 멤버 · ${D.days(s)}`;
      $('#attend-list').innerHTML = people.length
        ? `<div><p class="label">화요일 그룹</p>${group('tue') || '<p class="faint">없음</p>'}</div><div><p class="label">수요일 그룹</p>${group('wed') || '<p class="faint">없음</p>'}</div>`
        : '<p class="faint">멤버 명단을 먼저 만들어 주세요.</p>';
      $('#attend-msg').textContent = '';
      attend.dataset.n = n;
      attend.hidden = false;
      attend.scrollIntoView({ block: 'center' });
    }));
    $('#attend-close').onclick = () => { attend.hidden = true; };
    attend.onsubmit = async (e) => {
      e.preventDefault();
      if (!(await guard($('#attend-msg')))) return;
      const n = Number(attend.dataset.n);
      const was = new Set(R.present(n).map((m) => m.id));
      const now = new Set($$('#attend-list input:checked').map((i) => i.value));
      const add = [...now].filter((id) => !was.has(id)).map((id) => ({ session_n: n, member_id: id }));
      const drop = [...was].filter((id) => !now.has(id));
      let error = null;
      if (add.length) ({ error } = await sb.from('attendance').upsert(add));
      if (!error && drop.length) ({ error } = await sb.from('attendance').delete().eq('session_n', n).in('member_id', drop));
      say($('#attend-msg'), error ? why(error) : `${n}회차 참여 ${now.size}명을 저장했어요.`);
      if (!error) setTimeout(manage, 600);
    };

    // clips
    const dict = R.sessions.filter((s) => s.kind === 'dictation');
    const pick = $('#clip-session');
    const keep = Number(pick.value) || (dict.find((s) => D.last(s) >= R.today) || dict[dict.length - 1] || {}).n;
    pick.innerHTML = dict.map((s) => `<option value="${s.n}"${s.n === keep ? ' selected' : ''}>${s.n}회차 · ${D.days(s)}</option>`).join('') || '<option value="">Dictation 회차가 없어요</option>';
    // Each group battles on its own clips; only the groups that meet that session are offered.
    const gpick = $('#clip-group');
    const groupsFor = () => {
      const s = R.sessions.find((x) => x.n === Number(pick.value));
      const keepG = gpick.value;
      const gs = s ? ['tue', 'wed'].filter((g) => s[`${g}_date`]) : [];
      const first = gs.includes(keepG) ? keepG : gs.find((g) => s[`${g}_date`] >= R.today) || gs[0];
      gpick.innerHTML = gs.map((g) => `<option value="${g}"${g === first ? ' selected' : ''}>${D.groups[g].name} 그룹 · ${D.day(s[`${g}_date`])}</option>`).join('') || '<option value="">–</option>';
    };
    groupsFor();
    const drawClips = async () => {
      const n = Number(pick.value), g = gpick.value;
      const s = R.sessions.find((x) => x.n === n);
      if (!s || !g) { $('#clips tbody').innerHTML = emptyRow(5, 'Dictation 회차를 먼저 만들어 주세요.'); return; }
      $('#clips-msg').textContent = '';
      const { data } = await sb.from('clips').select('*').eq('session_n', n).eq('grp', g);
      const by = Object.fromEntries((data || []).map((c) => [c.round, c]));
      $('#clips tbody').innerHTML = Array.from({ length: s.rounds }, (_, i) => {
        const c = by[i + 1] || {};
        return `<tr class="clip-row" data-round="${i + 1}"><td>${i + 1}</td>
          <td><input class="input" name="source" aria-label="라운드 ${i + 1} 출처" value="${esc(c.source || '')}" placeholder="인터뷰 영상" style="min-width:8rem"></td>
          <td><input class="input num" name="segment" aria-label="라운드 ${i + 1} 구간" value="${esc(c.segment || '')}" placeholder="03:12–03:18" style="width:8.5rem"></td>
          <td><input class="input" name="url" type="url" aria-label="라운드 ${i + 1} 원본 링크" value="${esc(c.url || '')}" placeholder="https://" style="min-width:10rem"></td>
          <td><input class="input" name="script" lang="en" aria-label="라운드 ${i + 1} 정답 스크립트" value="${esc(c.script || '')}" placeholder="들리는 문장 그대로" style="min-width:18rem"></td></tr>`;
      }).join('');
    };
    pick.onchange = () => { groupsFor(); drawClips(); };
    gpick.onchange = drawClips;
    await drawClips();
    $('#clips-save').onclick = async () => {
      if (!(await guard($('#clips-msg')))) return;
      const n = Number(pick.value), g = gpick.value;
      if (!g) return;
      const rows = $$('#clips tbody tr[data-round]').map((tr) => ({ session_n: n, grp: g, round: Number(tr.dataset.round), source: tr.querySelector('[name=source]').value.trim(), segment: tr.querySelector('[name=segment]').value.trim(), url: tr.querySelector('[name=url]').value.trim() || null, script: tr.querySelector('[name=script]').value.trim() }));
      const { error } = await sb.from('clips').upsert(rows);
      say($('#clips-msg'), error ? why(error) : `${n}회차 ${D.groups[g].name} 그룹 클립 ${rows.filter((r) => r.script).length}개를 저장했어요.`);
    };

    // members, with their phone numbers and login state
    const unlinked = phones.filter((p) => !p.member_id);
    $('#unlinked').innerHTML = unlinked.length
      ? `아직 멤버와 연결되지 않은 번호: ${unlinked.map((p) => `<b class="num">${esc(D.phoneText(p.phone))}</b>${p.is_admin ? ' (운영진)' : ''}`).join(', ')}. 그 사람을 멤버로 추가하고 이 번호를 넣으면 연결돼요.`
      : '';
    const came = (id) => R.sessions.filter((s) => R.present(s.n).some((m) => m.id === id)).length;
    const order = [...R.members].sort((a, b) => (a.grp === b.grp ? a.name.localeCompare(b.name, 'ko') : a.grp === 'tue' ? -1 : 1));
    const memberRow = (m) => {
      const p = m ? phoneOf[m.id] : null;
      const state = !p ? '<span class="faint">번호 없음</span>' : p.locked ? '<span class="pill">잠김</span>' : p.has_password ? '<span class="pill positive">설정됨</span>' : '<span class="pill">첫 로그인 전</span>';
      return `<tr data-id="${m ? m.id : ''}" data-phone="${p ? p.phone : ''}" data-admin="${p && p.is_admin ? '1' : ''}">
        <td><input class="input" name="name" aria-label="표시 이름" value="${esc(m ? m.name : '')}" placeholder="표시 이름" maxlength="20" style="min-width:8rem"></td>
        <td><select class="input" name="grp" aria-label="그룹" style="width:7rem;height:36px"><option value="tue"${m && m.grp === 'tue' ? ' selected' : ''}>화요일</option><option value="wed"${m && m.grp === 'wed' ? ' selected' : ''}>수요일</option></select></td>
        <td><input class="input num" name="phone" type="tel" inputmode="numeric" autocomplete="off" aria-label="휴대폰 번호" value="${esc(p ? D.phoneText(p.phone) : '')}" placeholder="010-0000-0000" style="min-width:9.5rem"></td>
        <td><label class="switch"><input type="checkbox" name="active" aria-label="활동 중"${!m || m.active ? ' checked' : ''}><span></span></label></td>
        <td><label class="switch"><input type="checkbox" name="admin" aria-label="운영진"${p && p.is_admin ? ' checked' : ''}><span></span></label></td>
        <td><span class="login-state">${state}</span>${p ? ` <button type="button" class="card-link" data-reset="${m.id}">초기화</button>` : ''}</td>
        <td class="r num">${m ? came(m.id) + '회' : '새 멤버'}</td></tr>`;
    };
    $('#roster-table tbody').innerHTML = order.map(memberRow).join('') || memberRow(null);
    $('#member-add').onclick = () => $('#roster-table tbody').insertAdjacentHTML('beforeend', memberRow(null));
    $$('[data-reset]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!(await guard($('#members-msg')))) return;
      try { await D.rpc('admin_reset_password', { p_member: btn.dataset.reset }); say($('#members-msg'), '비밀번호를 초기화했어요. 그 멤버는 다음 로그인 때 새 비밀번호를 정해요.'); manage(); }
      catch (er) { say($('#members-msg'), why(er)); }
    }));
    $('#members-save').onclick = async () => {
      if (!(await guard($('#members-msg')))) return;
      const digits = (v) => v.replace(/[^0-9]/g, '');
      const rows = $$('#roster-table tbody tr').map((tr) => ({
        id: tr.dataset.id || null, name: tr.querySelector('[name=name]').value.trim(), grp: tr.querySelector('[name=grp]').value,
        active: tr.querySelector('[name=active]').checked, phone: digits(tr.querySelector('[name=phone]').value),
        was: tr.dataset.phone, admin: tr.querySelector('[name=admin]').checked, wasAdmin: !!tr.dataset.admin,
      })).filter((r) => r.name);
      const bad = rows.find((r) => r.phone && !/^01[0-9]{8,9}$/.test(r.phone));
      if (bad) { say($('#members-msg'), `${bad.name}의 휴대폰 번호를 다시 확인해 주세요. 010으로 시작하는 숫자 10~11자리예요.`); return; }
      const old = rows.filter((r) => r.id).map((r) => ({ id: r.id, display_name: r.name, grp: r.grp, active: r.active }));
      const fresh = rows.filter((r) => !r.id).map((r) => ({ display_name: r.name, grp: r.grp, active: r.active }));
      let error = null;
      if (old.length) ({ error } = await sb.from('members').upsert(old));
      if (!error && fresh.length) {
        const res = await sb.from('members').insert(fresh).select('id, display_name');
        error = res.error;
        if (!error) res.data.forEach((m) => { const r = rows.find((x) => !x.id && x.name === m.display_name); if (r) r.id = m.id; });
      }
      if (error) { say($('#members-msg'), /duplicate|unique/.test(error.message) ? '같은 표시 이름이 이미 있어요.' : why(error)); return; }
      const problems = [];
      for (const r of rows) {
        try {
          if (r.id && r.phone !== (r.was || '')) await D.rpc('admin_set_phone', { p_member: r.id, p_phone: r.phone });
          if (r.id && r.phone && r.admin !== r.wasAdmin) await D.rpc('admin_set_admin', { p_member: r.id, p_admin: r.admin });
        } catch (er) {
          const m = er.message;
          problems.push(`${r.name}: ${m === 'phone_taken' ? '이미 다른 멤버가 쓰는 번호예요' : m === 'last_admin' ? '마지막 운영진은 뺄 수 없어요' : m === 'phone_format' ? '번호 형식이 달라요' : why(er)}`);
        }
      }
      say($('#members-msg'), problems.length ? `저장했지만 ${problems.join(', ')}.` : `멤버 ${rows.length}명을 저장했어요.`);
      manage();
    };

    // scores
    const done = R.battles.filter((b) => b.status === 'finished').sort((a, b) => b.session_n - a.session_n);
    $('#scores-list').innerHTML = done.map((b) => {
      const rows = R.subs.filter((x) => x.session_n === b.session_n && x.grp === b.grp);
      const people = new Set(rows.map((x) => x.member_id)).size;
      const top = R.board(b)[0];
      return `<li><span><b>${b.session_n}회차 ${D.groups[b.grp].name} 그룹</b><span class="sub">${people}명 · 1위 ${top ? `${esc(top.name)} ${top.total}점` : '–'}</span></span>
        ${b.confirmed_at ? `<span><span class="pill positive">확정됨</span> <button type="button" class="card-link" data-unconfirm="${b.session_n}:${b.grp}">확정 취소</button></span>` : `<button type="button" class="btn btn-primary" data-confirm="${b.session_n}:${b.grp}">확정</button>`}</li>`;
    }).join('') || emptyLi('끝난 배틀이 생기면 여기에서 점수를 확정해요.');
    const setConfirm = async (k, v) => {
      if (!(await guard(status))) return;
      const [s, g] = k.split(':');
      const { error } = await sb.from('battles').update({ confirmed_at: v }).eq('session_n', Number(s)).eq('grp', g);
      if (error) status.textContent = why(error); else manage();
    };
    $$('[data-confirm]').forEach((btn) => btn.addEventListener('click', () => setConfirm(btn.dataset.confirm, new Date().toISOString())));
    $$('[data-unconfirm]').forEach((btn) => btn.addEventListener('click', () => setConfirm(btn.dataset.unconfirm, null)));
  }

  // ---------- 배틀 진행 ----------
  function host() {
    let R = null, sel = null;
    const gate = $('#gate');
    const relogin = () => { $('#host-sub').innerHTML = `<b>${RELOGIN}</b>`; U.openLogin(RELOGIN); };
    const draw = async () => {
      R = await D.load();
      $('#admin-status').textContent = '배틀을 열고 라운드를 진행해요. 프로젝터에는 프로젝터 화면을 띄우세요.';
      const dict = R.sessions.filter((s) => s.kind === 'dictation');
      if (!dict.length) {
        gate.hidden = false;
        gate.innerHTML = 'Dictation 회차가 아직 없어요. <button type="button" class="card-link" data-go="manage">운영에서 회차 만들기</button>';
        $('#console').hidden = true; $('#host-action').hidden = true;
        gate.querySelector('[data-go]').onclick = () => open('manage');
        return;
      }
      gate.hidden = true;
      if (!sel) {
        const today = R.today;
        const s0 = dict.find((x) => x.tue_date === today || x.wed_date === today) || dict.find((x) => D.last(x) >= today) || dict[dict.length - 1];
        sel = { n: s0.n, grp: s0.tue_date === today ? 'tue' : s0.wed_date === today ? 'wed' : s0.tue_date ? 'tue' : 'wed' };
      }
      $('#pick-session').innerHTML = dict.map((x) => `<option value="${x.n}"${x.n === sel.n ? ' selected' : ''}>${x.n}회차 · ${D.days(x)}</option>`).join('');
      $('#pick-group').value = sel.grp;
      const s = R.sessions.find((x) => x.n === sel.n);
      const b = R.battles.find((x) => x.session_n === sel.n && x.grp === sel.grp);
      const noDay = !s[`${sel.grp}_date`];
      $('#host-title').textContent = `${sel.n}회차 배틀 · ${D.groups[sel.grp].name} 그룹`;
      const act = $('#host-action');
      act.disabled = false; act.hidden = false;
      const update = async (patch) => {
        if (!(await D.stillIn())) { relogin(); return; }
        const { error } = await D.sb.from('battles').update(patch).eq('session_n', sel.n).eq('grp', sel.grp);
        if (error) $('#host-sub').textContent = why(error); else draw();
      };
      if (!b) {
        $('#host-sub').innerHTML = '<b>아직 열지 않은 배틀이에요.</b> 열면 네 자리 입장 코드가 만들어져요.'
          + (noDay ? ` <span style="color:#ffb3b3">이 회차는 ${D.groups[sel.grp].name} 모임 날짜가 없어요.</span>` : '');
        act.textContent = '배틀 열기';
        act.onclick = async () => {
          if (!(await D.stillIn())) { relogin(); return; }
          try { await D.rpc('open_battle', { p_session: sel.n, p_grp: sel.grp }); draw(); } catch (er) { $('#host-sub').textContent = why(er); }
        };
        $('#code-value').textContent = '–';
        $('#console').hidden = true;
        return;
      }
      $('#console').hidden = false;
      const { data: code } = await D.sb.from('battle_codes').select('code').eq('session_n', sel.n).eq('grp', sel.grp).maybeSingle();
      $('#code-value').textContent = code ? code.code : '–';
      const { data: clips } = await D.sb.from('clips').select('*').eq('session_n', sel.n).eq('grp', sel.grp).order('round');
      const board = R.board(b);
      const roundSubs = R.subs.filter((x) => x.session_n === sel.n && x.grp === sel.grp && x.round === b.current_round);
      const clip = (clips || []).find((c) => c.round === (b.status === 'ready' ? 1 : b.current_round)) || null;
      const nextRound = b.status === 'ready' ? 1 : b.current_round + 1;

      if (b.status === 'open') {
        $('#host-sub').innerHTML = `<b>라운드 ${b.current_round} / ${s.rounds} 진행 중.</b> ${board.length}명 중 ${roundSubs.length}명이 냈어요.`;
        act.textContent = '라운드 종료하고 채점'; act.onclick = () => update({ status: 'closed' });
      } else if (b.status === 'finished') {
        $('#host-sub').innerHTML = `<b>배틀이 끝났어요.</b> ${b.confirmed_at ? '점수가 확정돼 랭킹에 더해졌어요.' : '운영 탭에서 점수를 확정하면 랭킹에 더해져요.'}`;
        act.textContent = '점수 확정하러 가기'; act.onclick = () => open('manage', '#s-scores');
      } else if (nextRound > s.rounds) {
        $('#host-sub').innerHTML = `<b>${s.rounds}라운드를 모두 마쳤어요.</b> 배틀을 끝내면 점수 확정을 기다려요.`;
        act.textContent = '배틀 끝내기'; act.onclick = () => update({ status: 'finished' });
      } else {
        const missing = !(clips || []).find((c) => c.round === nextRound && c.script.trim());
        $('#host-sub').innerHTML = (b.status === 'ready'
          ? `<b>입장 대기 중.</b> ${board.length}명이 들어왔어요. 모두 들어오면 라운드 1을 시작하세요.`
          : `<b>라운드 ${b.current_round} 채점 끝.</b> 다음은 라운드 ${nextRound}이에요.`)
          + (missing ? ` <span style="color:#ffb3b3">라운드 ${nextRound} 정답 스크립트가 비어 있어요.</span>` : '');
        act.textContent = `라운드 ${nextRound} 시작`; act.disabled = missing;
        act.onclick = () => update({ status: 'open', current_round: nextRound, round_started_at: new Date().toISOString(), plays: 1 });
      }

      $('#h-sub').innerHTML = `${roundSubs.length}<small>/ ${board.length}명</small>`;
      $('#h-plays').innerHTML = `${b.plays}<small>/ 2번</small>`;
      const [a, c] = board;
      $('#h-lead').innerHTML = a && a.total ? `${esc(a.name)} <small>${a.total}점</small>` : '–';
      $('#h-lead-cap').textContent = a && c && a.total ? `2위 ${wa(c.name)} ${a.total - c.total}점 차` : '첫 라운드 뒤에 정해져요';
      clearInterval(hostTick);
      const clock = () => {
        if (b.status !== 'open') { $('#h-left').textContent = b.status === 'closed' ? '채점 끝' : '–'; return; }
        const left = Math.max(0, 20 - (Date.now() - new Date(b.round_started_at).getTime()) / 1000);
        $('#h-left').textContent = `0:${String(Math.ceil(left)).padStart(2, '0')}`;
      };
      clock(); hostTick = setInterval(clock, 250);

      $('#clip-title').textContent = `라운드 ${clip ? clip.round : nextRound} 클립`;
      $('#clip-src').textContent = clip ? [clip.source, clip.segment].filter(Boolean).join(' · ') || '출처 미입력' : '클립 정보가 없어요';
      $('#clip-open').hidden = !(clip && clip.url);
      if (clip && clip.url) $('#clip-open').href = clip.url;
      $('#clip-script').textContent = clip && clip.script ? clip.script : '정답 스크립트가 비어 있어요. 운영 탭에서 넣어 주세요.';
      $('#replay').disabled = b.status !== 'open' || b.plays >= 2;
      $('#replay').textContent = b.plays < 2 ? `다시 재생 표시 (${2 - b.plays}번 남음)` : '두 번 다 들려줬어요';
      $('#replay').onclick = () => update({ plays: Math.min(2, b.plays + 1) });

      $('#submits').innerHTML = R.members.filter((m) => m.active && m.grp === sel.grp).map((m) => {
        const here = board.find((x) => x.id === m.id);
        const done = roundSubs.find((x) => x.member_id === m.id);
        const st = !here ? '<span class="faint">입장 안 함</span>' : b.status !== 'open' ? '<span class="pill">입장</span>' : done ? '<span class="pill positive">냈어요</span>' : '<span class="pill">입력 중</span>';
        return `<li><span>${who(m)}${here ? `<span class="sub" style="margin:6px 0 0 36px">${U.strip(here.rounds, s.rounds, b)}</span>` : ''}</span>${st}</li>`;
      }).join('') || emptyLi('이 그룹 명단이 비어 있어요.');

      $('#round-list').innerHTML = Array.from({ length: s.rounds }, (_, i) => {
        const n = i + 1;
        const rows = R.subs.filter((x) => x.session_n === sel.n && x.grp === sel.grp && x.round === n);
        const c2 = (clips || []).find((x) => x.round === n);
        const right = n < b.current_round || (n === b.current_round && b.status !== 'open')
          ? (rows.length ? `<span class="num muted">평균 정확도 ${Math.round(rows.reduce((p, x) => p + x.accuracy, 0) / rows.length)}%</span>` : '<span class="faint">제출 없음</span>')
          : n === b.current_round ? '<span class="pill accent">진행 중</span>' : '<span class="faint">대기</span>';
        return `<li><span><b>라운드 ${n}</b><span class="sub">${esc(c2 ? [c2.source, c2.segment].filter(Boolean).join(' · ') || '출처 미입력' : '클립 없음')}</span></span>${right}</li>`;
      }).join('');

      const lastN = b.status === 'open' ? b.current_round - 1 : b.current_round;
      $('#last-round-title').textContent = lastN >= 1 ? `라운드 ${lastN} 결과` : '라운드 결과';
      $('#last-round tbody').innerHTML = lastN >= 1 && board.length
        ? board.map((x) => { const r = x.rounds.find((q) => q.round === lastN); return `<tr><td>${who(x)}</td>${r ? `<td class="r">${r.accuracy}%</td><td class="r">+${r.speed}</td><td class="r">${r.bonus ? '+' + r.bonus : '<span class="dash">0</span>'}</td><td class="r"><b>${r.total}</b></td>` : '<td class="r dash" colspan="4">안 냄</td>'}<td class="r muted">${x.total}</td></tr>`; }).join('')
        : emptyRow(6, '첫 라운드가 끝나면 결과가 여기에 쌓여요.');
    };
    $('#pick-session').addEventListener('change', (e) => { sel.n = Number(e.target.value); draw(); });
    $('#pick-group').addEventListener('change', (e) => { sel.grp = e.target.value; draw(); });
    draw();
    let t;
    stopWatch = D.watch(['battles', 'submissions', 'battle_joins'], () => { clearTimeout(t); t = setTimeout(draw, 200); });
  }

  // ---------- open in place of the page ----------
  async function open(view = 'manage', focus) {
    const main = document.querySelector('main');
    if (!(await D.isAdmin())) { U.openLogin('관리자 번호로 로그인해 주세요.'); return; }
    stopWatch(); stopWatch = () => {};
    clearInterval(hostTick);
    main.className = 'column admin';
    main.innerHTML = shell(view);
    document.body.dataset.page = 'admin'; // the page's own scripts stop redrawing what is no longer there
    document.title = '관리자 · Read Together';
    $$('[data-view]', main).forEach((btn) => btn.addEventListener('click', () => open(btn.dataset.view)));
    $('#admin-view').innerHTML = view === 'host' ? HOST : MANAGE;
    scrollTo(0, 0);
    try {
      if (view === 'host') host();
      else { await manage(); if (focus) $(focus)?.scrollIntoView({ block: 'start' }); }
    } catch (e) { console.error(e); $('#admin-status').textContent = why(e); }
  }

  return { open };
})();
