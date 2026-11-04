// Read Together — the data layer. Reads the club's records from Supabase and computes what the screens show.
// Members log in with their phone number; the login key travels in the x-rt-token header and the database
// works out who is calling from it (supabase/003_phone_login.sql).
window.DB = (() => {
  const cfg = window.RT_CONFIG || {};
  const KEY = 'rt-token';
  const store = {
    get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
    set: (t) => { try { localStorage.setItem(KEY, t); } catch {} },
    clear: () => { try { localStorage.removeItem(KEY); } catch {} },
  };
  const token = store.get();
  const ready = !!(cfg.url && cfg.key && window.supabase);
  const sb = ready ? window.supabase.createClient(cfg.url, cfg.key, {
    global: { headers: token ? { 'x-rt-token': token } : {} },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) : null;

  const groups = {
    tue: { key: 'tue', name: '화요일', time: '17:00–18:00', start: '17:00' },
    wed: { key: 'wed', name: '수요일', time: '18:30–19:30', start: '18:30' },
  };
  const hues = [20, 200, 140, 320, 80, 260, 40, 220, 300, 0, 160, 100, 60, 240, 180, 340];
  const fmt = (n) => Number(n).toLocaleString('ko-KR');
  const day = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${m}월 ${d}일`; };
  // A session may run for one group only, so either date can be empty.
  const first = (s) => s.tue_date || s.wed_date;
  const last = (s) => s.wed_date || s.tue_date;
  const days = (s) => [s.tue_date && `화 ${day(s.tue_date)}`, s.wed_date && `수 ${day(s.wed_date)}`].filter(Boolean).join(' · ');
  const when = (s) => [s.tue_date && `화요일 ${day(s.tue_date)} 17:00`, s.wed_date && `수요일 ${day(s.wed_date)} 18:30`].filter(Boolean).join(', ');
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const weekday = { tue: '화', wed: '수' };
  // The two groups read different articles (supabase/005_group_articles.sql). Null when that group does not meet.
  const article = (s, g) => (s && s[`${g}_date`] ? {
    grp: g, title: s[`${g}_article_title`], url: s[`${g}_article_url`], type: s[`${g}_article_type`], minutes: s[`${g}_article_minutes`],
  } : null);
  const articles = (s) => ['tue', 'wed'].map((g) => article(s, g)).filter(Boolean);
  const phoneText = (p) => (p || '').replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');

  const must = ({ data, error }) => { if (error) throw error; return data; };

  async function load() {
    if (!ready) throw new Error('not_configured');
    const [members, sessions, battles, subs, sentences, joins, attendance] = await Promise.all([
      sb.from('members').select('*').order('created_at').then(must),
      sb.from('sessions').select('*').order('n').then(must),
      sb.from('battles').select('*').then(must),
      sb.from('submissions').select('*').then(must),
      sb.from('sentences').select('*').order('created_at').then(must),
      sb.from('battle_joins').select('*').then(must),
      sb.from('attendance').select('*').then(must),
    ]);
    return compute({ members, sessions, battles, subs, sentences, joins, attendance });
  }

  function compute({ members, sessions, battles, subs, sentences, joins, attendance }) {
    members = members.map((m, i) => ({ ...m, name: m.display_name, group: m.grp, hue: hues[i % hues.length] }));
    const byId = Object.fromEntries(members.map((m) => [m.id, m]));
    const confirmed = battles.filter((b) => b.confirmed_at);
    const key = (s, g) => `${s}:${g}`;
    const isConfirmed = new Set(confirmed.map((b) => key(b.session_n, b.grp)));

    // Session totals from confirmed battles only: { n: { memberId: total } }
    const totals = {};
    subs.filter((x) => isConfirmed.has(key(x.session_n, x.grp))).forEach((x) => {
      totals[x.session_n] = totals[x.session_n] || {};
      totals[x.session_n][x.member_id] = (totals[x.session_n][x.member_id] || 0) + x.total;
    });
    const battleNs = Object.keys(totals).map(Number).sort((a, b) => a - b);

    const winners = battleNs.map((n) => {
      const t = totals[n];
      const best = (ids) => ids.filter((id) => t[id] != null).sort((a, b) => t[b] - t[a])[0] || null;
      const ids = Object.keys(t).filter((id) => byId[id]);
      return { n, tue: best(ids.filter((id) => byId[id].grp === 'tue')), wed: best(ids.filter((id) => byId[id].grp === 'wed')), overall: best(ids) };
    });

    const standings = members.filter((m) => m.active || battleNs.some((n) => totals[n][m.id] != null)).map((m) => {
      const per = battleNs.map((n) => (totals[n][m.id] != null ? totals[n][m.id] : null));
      const total = per.reduce((a, v) => a + (v || 0), 0);
      const came = per.filter((v) => v != null).length;
      const coffee = winners.filter((w) => w.tue === m.id || w.wed === m.id).length;
      return { ...m, per, total, came, coffee };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ko'));
    standings.forEach((s, i) => { s.rank = i + 1; });
    const groupRank = (g) => standings.filter((s) => s.grp === g).map((s, i) => ({ ...s, grank: i + 1 }));

    // Who took part in each session, as the organisers ticked it (battle entries tick themselves).
    const present = (n) => attendance.filter((a) => a.session_n === n && byId[a.member_id]).map((a) => byId[a.member_id]);

    // The session happening now or next, by date.
    const today = todayISO();
    const current = sessions.find((s) => last(s) >= today) || sessions[sessions.length - 1] || null;

    // The battle that is running: not finished, newest session first.
    const liveBattle = [...battles].filter((b) => b.status !== 'finished').sort((a, b) => b.session_n - a.session_n || (a.grp === 'tue' ? -1 : 1))[0] || null;
    const board = (b) => {
      if (!b) return [];
      const here = joins.filter((j) => j.session_n === b.session_n && j.grp === b.grp).map((j) => j.member_id);
      return here.filter((id) => byId[id]).map((id) => {
        const rows = subs.filter((x) => x.session_n === b.session_n && x.grp === b.grp && x.member_id === id).sort((p, q) => p.round - q.round);
        const lastRow = rows[rows.length - 1];
        return { ...byId[id], rounds: rows, total: rows.reduce((a, x) => a + x.total, 0), streak: lastRow && lastRow.round >= b.current_round - 1 ? lastRow.streak : 0 };
      }).sort((p, q) => q.total - p.total || p.name.localeCompare(q.name, 'ko'));
    };

    return { groups, members, byId, sessions, battles, subs, sentences, joins, attendance, present, totals, battleNs, winners, standings, groupRank, current, liveBattle, board, today };
  }

  // ---------- the member who is logged in ----------
  let mePromise = null;
  const me = () => {
    if (!ready || !token) return Promise.resolve(null);
    if (!mePromise) {
      mePromise = sb.rpc('member_me').then(({ data, error }) => {
        if (error) return null;
        if (!data) store.clear(); // the key expired or was reset by an organiser
        return data || null;
      }, () => null);
    }
    return mePromise;
  };
  const forget = () => { mePromise = null; }; // after the member changed their own name
  const stillIn = async () => {
    if (!ready || !token) return false;
    const { data, error } = await sb.rpc('member_me');
    return !error && !!data;
  };
  const login = async (phone, password, setting) => {
    const { data, error } = await sb.rpc(setting ? 'member_set_password' : 'member_login', { p_phone: phone, p_password: password });
    if (error) throw error;
    if (data && data.token) store.set(data.token);
    return data;
  };
  const logout = async () => {
    if (ready && token) await sb.rpc('member_logout').catch(() => {});
    store.clear();
  };

  return {
    ready, sb, groups, fmt, day, days, when, first, last, weekday, article, articles, todayISO, phoneText, load,
    rpc: async (fn, args) => must(await sb.rpc(fn, args)),
    me, forget, stillIn, login, logout,
    isAdmin: async () => !!((await me()) || {}).is_admin,
    watch: (tables, onChange) => {
      if (!ready) return () => {};
      const ch = sb.channel('rt-' + Math.random().toString(36).slice(2));
      tables.forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, onChange));
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },
  };
})();
