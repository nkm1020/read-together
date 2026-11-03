// Read Together — 1안. The live round: watch a film line, fill the blank, scored like the real battle.
(() => {
  const root = document.getElementById('round');
  if (!root) return;

  // Lines from two film scenes, played in YouTube's own player. Times are seconds into each clip.
  const PURSUIT = { id: 'UZb2NOHPA2A', film: '행복을 찾아서 (2006)' };
  const POETS = { id: '-pRjNwYEEIE', film: '죽은 시인의 사회 (1989)' };
  const rounds = [
    { clip: PURSUIT, start: 64.0, end: 68.9, before: 'Don’t ever let somebody ', answer: 'tell', after: ' you… you can’t do something.' },
    { clip: PURSUIT, start: 77.1, end: 81.8, before: 'You got a dream, you ', answer: 'gotta protect', also: ['got to protect'], after: ' it.' },
    { clip: POETS, start: 39.2, end: 43.1, before: 'We don’t read and write poetry because it’s ', answer: 'cute', after: '.' },
    { clip: POETS, start: 43.2, end: 51.9, before: 'We read and write poetry because we are members of the human race, and the human race is ', answer: 'filled with passion', after: '.' },
  ];
  const PLAYS = 2;  // the clip is played twice
  const LEAD = 15;  // seconds to type, on top of hearing the line twice
  const limitOf = (r) => Math.round((LEAD + PLAYS * (r.end - r.start)) / 5) * 5;

  const sentence = document.getElementById('round-sentence');
  const input = document.getElementById('round-input');
  const play = document.getElementById('round-play');
  const submit = document.getElementById('round-submit');
  const skip = document.getElementById('round-skip');
  const timer = document.getElementById('round-timer');
  const status = document.getElementById('round-status');
  const screen = document.getElementById('round-screen');
  const out = {
    acc: document.getElementById('r-acc'),
    speed: document.getElementById('r-speed'),
    streak: document.getElementById('r-streak'),
    total: document.getElementById('r-total'),
  };

  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let index = 0, plays = 0, startedAt = 0, tick = 0, streak = 0, sum = 0, done = false;
  let player = null, ready = false, failed = false, ours = false, retried = false, shown = '', guard = 0, nudge = 0;

  const words = (s) => s.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
  const lev = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  // Word-level match, with letter-level partial credit inside a word, so "showin up" still earns most of it.
  const accuracy = (typed, answer) => {
    const t = words(typed), a = words(answer);
    if (!t.length) return 0;
    let score = 0;
    a.forEach((w, i) => {
      const g = t[i] || '';
      score += Math.max(0, 1 - lev([...g], [...w]) / Math.max(w.length, g.length));
    });
    const extra = Math.max(0, t.length - a.length);
    return Math.max(0, (score - extra) / a.length);
  };
  const best = (typed, r) => Math.max(...[r.answer, ...(r.also || [])].map((a) => accuracy(typed, a)));

  const voice = () => {
    const list = speechSynthesis.getVoices();
    return list.find((v) => /en-US/i.test(v.lang) && /Samantha|Google US|Aria|Jenny/i.test(v.name))
      || list.find((v) => /^en-US/i.test(v.lang)) || list.find((v) => /^en/i.test(v.lang));
  };

  // The film plays when YouTube loads; a clip it refuses falls back to the browser's voice, then to text.
  const how = () => {
    if (!failed && !rounds[index].clip.broken) return ready ? 'film' : 'wait';
    return canSpeak ? 'speech' : 'text';
  };
  const LABELS = { film: ['장면 보기', '한 번 더 보기'], speech: ['문장 듣기', '한 번 더 듣기'], text: ['문장 보기', '한 번 더 보기'] };

  const arm = () => {
    const way = how();
    screen.hidden = way === 'speech' || way === 'text';
    skip.hidden = done;
    if (way === 'wait') { play.textContent = '장면 불러오는 중'; play.disabled = true; return; }
    play.textContent = plays >= PLAYS ? '다 들었어요' : LABELS[way][plays ? 1 : 0];
    play.disabled = done || plays >= PLAYS;
  };

  const halt = () => {
    clearInterval(guard);
    clearTimeout(nudge);
    ours = false;
    if (player && ready && player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
  };

  const render = () => {
    const r = rounds[index];
    halt();
    sentence.firstChild.textContent = r.before;
    sentence.lastChild.textContent = r.after;
    input.value = '';
    input.disabled = false;
    input.style.width = Math.max(5, r.answer.length + 2) + 'ch';
    plays = 0; startedAt = 0; done = false;
    clearInterval(tick);
    timer.textContent = `제한 시간 ${limitOf(r)}초`;
    submit.textContent = '제출';
    status.textContent = `${r.clip.film}, 문장 ${index + 1} / ${rounds.length}` + (sum ? `, 지금까지 ${sum}점` : '');
    cue();
    arm();
  };
  const cue = () => {
    const r = rounds[index];
    if (how() !== 'film' || shown === r.clip.id) return;
    shown = r.clip.id;
    player.cueVideoById({ videoId: r.clip.id, startSeconds: r.start });
  };

  const startClock = () => {
    if (startedAt) return;
    const limit = limitOf(rounds[index]);
    startedAt = performance.now();
    tick = setInterval(() => {
      const left = Math.max(0, limit - (performance.now() - startedAt) / 1000);
      timer.textContent = `남은 시간 ${Math.ceil(left)}초`;
      if (left <= 0) score();
    }, 250);
  };

  const take = () => {
    plays += 1;
    arm();
    input.focus({ preventScroll: true });
  };

  // Captions would print the answer on screen, so they stay off.
  const quiet = () => { if (player.unloadModule) { player.unloadModule('captions'); player.unloadModule('cc'); } };

  // The browser kept the video from starting: give the play back and ask for a tap on the video itself.
  const refuse = () => {
    if (!ours) return;
    clearTimeout(nudge);
    ours = false;
    plays -= 1;
    arm();
    status.textContent = '재생이 막혔어요. 영상을 한 번 직접 눌러 주세요.';
  };

  const changed = (e) => {
    const r = rounds[index];
    if (e.data === YT.PlayerState.CUED && ours) {
      if (retried) refuse();
      else { retried = true; player.seekTo(r.start, true); player.playVideo(); }
      return;
    }
    if (e.data !== YT.PlayerState.PLAYING) return;
    quiet();
    if (!ours) {
      // A tap on the video itself counts as one of the plays.
      if (done || plays >= PLAYS) { player.pauseVideo(); return; }
      ours = true;
      take();
    }
    // However it started, the clip plays only the line.
    const at = player.getCurrentTime();
    if (at < r.start - 1 || at >= r.end - 0.2) player.seekTo(r.start, true);
    clearTimeout(nudge);
    startClock();
    clearInterval(guard);
    guard = setInterval(() => { if (player.getCurrentTime() >= rounds[index].end) halt(); }, 100);
  };

  const broke = () => {
    rounds[index].clip.broken = true;
    halt();
    arm();
  };

  const make = () => {
    const r = rounds[index];
    shown = r.clip.id;
    player = new YT.Player('round-player', {
      host: 'https://www.youtube-nocookie.com',
      videoId: r.clip.id,
      // An English player interface keeps YouTube from switching on captions for a Korean visitor.
      playerVars: { start: Math.floor(r.start), controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, cc_load_policy: 0, iv_load_policy: 3, hl: 'en' },
      events: {
        onReady: () => { ready = true; cue(); arm(); },
        onStateChange: changed,
        onApiChange: quiet,
        onError: broke,
      },
    });
  };

  // YouTube's script is fetched only as the round comes near, so the top of the page stays light.
  const load = () => {
    const give = () => { if (!ready) { failed = true; arm(); } };
    if (window.YT && YT.Player) { make(); return; }
    window.onYouTubeIframeAPIReady = make;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = give;
    document.head.append(s);
    setTimeout(give, 12000);
  };
  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      near.disconnect();
      load();
    }, { rootMargin: '800px 0px' });
    near.observe(root);
  } else load();

  const speak = () => {
    const r = rounds[index];
    const way = how();
    if (plays >= PLAYS || done || way === 'wait') return;
    if (way === 'film') {
      ours = true;
      retried = false;
      take();
      player.seekTo(r.start, true);
      player.playVideo();
      // Some phones start a video only when it is tapped directly.
      clearTimeout(nudge);
      nudge = setTimeout(() => { if (player.getPlayerState() !== YT.PlayerState.PLAYING) refuse(); }, 6000);
      return;
    }
    plays += 1;
    startClock();
    if (way === 'speech') {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(r.before + r.answer + r.after);
      const v = voice();
      if (v) u.voice = v;
      u.lang = 'en-US';
      u.rate = 0.95;
      speechSynthesis.speak(u);
    } else {
      // No film and no speech in this browser: show the full sentence for three seconds instead.
      status.textContent = `“${r.before}${r.answer}${r.after}”`;
      setTimeout(() => { if (!done) status.textContent = `문장 ${index + 1} / ${rounds.length}`; }, 3000);
    }
    arm();
    input.focus({ preventScroll: true });
  };

  const score = () => {
    if (done) return;
    done = true;
    clearInterval(tick);
    halt();
    const r = rounds[index];
    const limit = limitOf(r);
    const elapsed = startedAt ? (performance.now() - startedAt) / 1000 : limit;
    const acc = best(input.value, r);
    const speed = acc >= 0.8 ? Math.round(20 * Math.max(0, limit - elapsed) / limit) : 0;
    streak = acc >= 0.95 ? streak + 1 : 0;
    const bonus = streak >= 2 ? Math.min(20, (streak - 1) * 5) : 0;
    const total = Math.round(acc * 100) + speed + bonus;
    sum += total;
    out.acc.textContent = `${Math.round(acc * 100)}%`;
    out.speed.textContent = `+${speed}`;
    out.streak.textContent = bonus ? `+${bonus}` : (streak ? '1번째' : '+0');
    out.total.textContent = `${total} / 140`;
    Object.values(out).forEach((el) => { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); });
    input.disabled = true;
    arm();
    timer.textContent = acc >= 0.95 ? '정답' : `정답은 “${r.answer}”`;
    const last = index === rounds.length - 1;
    status.textContent = last
      ? `${rounds.length}문장 합계 ${sum}점. 실제 배틀에서는 이런 라운드를 여러 번 해요.`
      : `문장 ${index + 1} / ${rounds.length}, 지금까지 ${sum}점`;
    submit.textContent = last ? '처음부터' : '다음 문장';
    submit.focus({ preventScroll: true }); // so Enter moves on, as it submitted
  };

  play.addEventListener('click', speak);
  input.addEventListener('focus', () => { if (!startedAt && how() === 'text') startClock(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done ? next() : score(); } });
  const next = () => {
    if (index === rounds.length - 1) { index = 0; sum = 0; streak = 0; }
    else index += 1;
    render();
    // A new sentence starts from its play button, so a second Enter never submits it blank.
    if (root.contains(document.activeElement)) play.focus({ preventScroll: true });
  };
  submit.addEventListener('click', () => (done ? next() : score()));
  // Skipping scores the sentence as 0 and goes straight on; on the last one it shows the total.
  skip.addEventListener('click', () => {
    input.value = '';
    score();
    if (index < rounds.length - 1) next();
  });
  if (canSpeak) speechSynthesis.getVoices();
  render();
})();

// Reveal each part once as its section enters. Never replays, never leaves content hidden.
(() => {
  const targets = document.querySelectorAll('[data-reveal], [data-lines], [data-reveal-group], .verb');
  if (!('IntersectionObserver' in window)) { targets.forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  targets.forEach((el) => io.observe(el));
  window.addEventListener('load', () => setTimeout(() => {
    targets.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in'); });
  }, 2500));
})();

// The looping clip in the title rests when the visitor asks for less motion.
(() => {
  const clip = document.querySelector('.slot video');
  if (!clip) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const apply = () => { if (still.matches) { clip.pause(); clip.removeAttribute('autoplay'); } else { clip.play().catch(() => {}); } };
  apply();
  still.addEventListener('change', apply);
})();
