/* ============================================================
   GoalPath — трекер целей: localStorage, цели с этапами,
   дневник настроения, обзор, экспорт JSON
   ============================================================ */
(function () {
  'use strict';
  window.GP = window.GP || {};
  var app = GP.app = {};
  var DB_KEY = 'goalpath_db_v1';
  var DAY = 86400000;
  var db = null;

  /* ---------- утилиты ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(s) {
    if (!s) return '—';
    var M = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    var p = s.split('-');
    return +p[2] + ' ' + M[+p[1] - 1];
  }
  function daysLeft(deadline) {
    if (!deadline) return null;
    var a = new Date(todayStr()).getTime();
    var p = deadline.split('-');
    var b = new Date(+p[0], +p[1] - 1, +p[2]).getTime();
    return Math.round((b - a) / DAY);
  }
  function plural(n, f) {
    n = Math.abs(n) % 100; var n1 = n % 10;
    if (n > 10 && n < 20) return f[2];
    if (n1 > 1 && n1 < 5) return f[1];
    if (n1 === 1) return f[0];
    return f[2];
  }
  function toast(text, type) {
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast--error' : (type === 'ok' ? ' toast--ok' : ''));
    el.textContent = text;
    wrap.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(function () { el.remove(); }, 300); }, 2600);
  }
  var MOODS = [
    { v: 1, e: '😞', label: 'Тяжело' },
    { v: 2, e: '😕', label: 'Так себе' },
    { v: 3, e: '😐', label: 'Нормально' },
    { v: 4, e: '🙂', label: 'Хорошо' },
    { v: 5, e: '😄', label: 'Отлично' }
  ];

  /* ---------- данные ---------- */
  function seed() {
    var now = Date.now();
    var T = todayStr();
    function D(n) {
      var d = new Date(now + n * DAY);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function st(t, done) { return { id: uid('st'), title: t, done: !!done }; }
    var goals = [
      {
        id: 'g1', title: 'Подготовиться к полумарафону',
        why: 'Хочу доказать себе, что могу довести большую цель до конца',
        deadline: D(21), createdAt: now - 30 * DAY, completedAt: null,
        stages: [st('Купить кроссовки и форму', true), st('Бег 3 раза в неделю', true), st('Пробежать 10 км без остановки', true), st('Пробежать 15 км', true), st('Зарегистрироваться на старт', false)]
      },
      {
        id: 'g2', title: 'Прочитать 4 книги за квартал',
        why: 'Возвращаю привычку читать вместо соцсетей',
        deadline: D(45), createdAt: now - 14 * DAY, completedAt: null,
        stages: [st('Книга 1: «Атомные привычки»', true), st('Книга 2: «Глубокая работа»', false), st('Книга 3: на выбор', false), st('Книга 4: на выбор', false)]
      },
      {
        id: 'g3', title: 'Наладить режим сна',
        why: 'Отбой до 23:00, без телефона в кровати',
        deadline: D(-3), createdAt: now - 40 * DAY, completedAt: now - 3 * DAY,
        stages: [st('Ложусь до 23:00 неделю подряд', true), st('Убрать телефон из спальни', true), st('Подъём в 7:00 без будильника-повтора', true)]
      }
    ];
    var diary = [
      { id: uid('d'), ts: now - 9 * DAY, mood: 3, text: 'Начал вести дневник. Настроение ровное.' },
      { id: uid('d'), ts: now - 7 * DAY, mood: 4, text: 'Пробежал первые 5 км — эмоции!' },
      { id: uid('d'), ts: now - 5 * DAY, mood: 2, text: 'Тяжёлый рабочий день, пропустил тренировку.' },
      { id: uid('d'), ts: now - 4 * DAY, mood: 4, text: 'Вернулся к плану. Помог чек-лист этапов.' },
      { id: uid('d'), ts: now - 2 * DAY, mood: 5, text: 'Закрыл цель по сну — сплю как младенец!' },
      { id: uid('d'), ts: now - 1 * DAY, mood: 4, text: 'Читаю перед сном вместо ленты.' }
    ];
    return { version: 1, createdAt: now, goals: goals, diary: diary };
  }

  function load() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      db = raw ? JSON.parse(raw) : null;
      if (!db || db.version !== 1 || !db.goals) db = seed();
    } catch (e) { db = seed(); }
    save();
  }
  function save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch (e) { console.error('save error', e); }
  }

  function goalProgress(g) {
    var total = g.stages.length;
    var done = g.stages.filter(function (s) { return s.done; }).length;
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
  }
  function stats() {
    var active = db.goals.filter(function (g) { return !g.completedAt; });
    var doneG = db.goals.filter(function (g) { return g.completedAt; });
    var st = { active: active.length, done: doneG.length, stagesDone: 0, stagesTotal: 0, over: 0, moodAvg: null };
    db.goals.forEach(function (g) {
      var p = goalProgress(g);
      st.stagesDone += p.done; st.stagesTotal += p.total;
      if (!g.completedAt && g.deadline && daysLeft(g.deadline) < 0) st.over++;
    });
    var week = Date.now() - 7 * DAY;
    var recent = db.diary.filter(function (d) { return d.ts >= week; });
    if (recent.length) st.moodAvg = (recent.reduce(function (s, d) { return s + d.mood; }, 0) / recent.length);
    return st;
  }

  /* ---------- действия ---------- */
  function addGoal(data) {
    var stages = data.stagesRaw.split('\n').map(function (l) { return l.trim(); }).filter(Boolean)
      .map(function (t) { return { id: uid('st'), title: t, done: false }; });
    if (!stages.length) return false;
    db.goals.unshift({
      id: uid('g'), title: data.title.trim(), why: data.why.trim(),
      deadline: data.deadline || null, createdAt: Date.now(), completedAt: null, stages: stages
    });
    save();
    return true;
  }
  function toggleStage(goalId, stageId) {
    var g = db.goals.find(function (x) { return x.id === goalId; });
    if (!g) return;
    var s = g.stages.find(function (x) { return x.id === stageId; });
    if (!s) return;
    s.done = !s.done;
    var p = goalProgress(g);
    if (p.pct === 100 && !g.completedAt) {
      g.completedAt = Date.now();
      toast('🎉 Цель «' + g.title + '» выполнена! Так держать!', 'ok');
    } else if (g.completedAt && p.pct < 100) {
      g.completedAt = null;
    }
    save();
  }
  function updateGoal(id, patch) {
    var g = db.goals.find(function (x) { return x.id === id; });
    if (!g) return;
    if (patch.title) g.title = patch.title.trim();
    if (patch.why !== undefined) g.why = patch.why.trim();
    if (patch.deadline !== undefined) g.deadline = patch.deadline || null;
    save();
  }
  function deleteGoal(id) {
    db.goals = db.goals.filter(function (g) { return g.id !== id; });
    save();
  }
  function addDiary(mood, text) {
    db.diary.unshift({ id: uid('d'), ts: Date.now(), mood: mood, text: (text || '').trim() });
    save();
  }
  function deleteDiary(id) {
    db.diary = db.diary.filter(function (d) { return d.id !== id; });
    save();
  }
  function exportJSON() {
    var data = { exportedAt: new Date().toISOString(), source: 'GoalPath MVP', goals: db.goals, diary: db.diary };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'goalpath-export-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ---------- рендер ---------- */
  var currentTab = 'goals';

  app.render = function () {
    document.title = 'GoalPath — трекер целей';
    var root = document.getElementById('app');
    root.innerHTML =
      '<header class="topbar">' +
        '<div class="topbar__brand"><img src="info/logo.svg" alt="GoalPath">' +
        '<div class="topbar__name">GoalPath<small>Трекер целей</small></div></div>' +
        '<nav class="topbar__tabs">' +
          '<button class="topbar__tab' + (currentTab === 'goals' ? ' is-active' : '') + '" data-tab="goals">🎯 Мои цели</button>' +
          '<button class="topbar__tab' + (currentTab === 'diary' ? ' is-active' : '') + '" data-tab="diary">📓 Дневник</button>' +
          '<button class="topbar__tab' + (currentTab === 'overview' ? ' is-active' : '') + '" data-tab="overview">📈 Обзор</button>' +
        '</nav>' +
        '<span class="spacer" style="flex:1"></span>' +
        '<button class="btn btn--ghost" id="btn-export" style="color:#fff;border-color:rgba(255,255,255,.4)">⬇ Экспорт</button>' +
      '</header>' +
      '<main class="page" id="page"></main>';

    root.querySelector('#btn-export').addEventListener('click', function () {
      exportJSON();
      toast('Экспорт сохранён в файл JSON', 'ok');
    });
    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { currentTab = b.dataset.tab; app.render(); });
    });

    var page = root.querySelector('#page');
    if (currentTab === 'goals') renderGoals(page);
    else if (currentTab === 'diary') renderDiary(page);
    else renderOverview(page);
  };

  function renderGoals(el) {
    var html = '<div class="page-head">' +
      '<div><div class="page-head__title">Мои цели</div>' +
      '<div class="page-head__sub">Большая цель — это лестница из маленьких шагов</div></div>' +
      '<button class="btn btn--primary" id="btn-new-goal">+ Новая цель</button></div>';

    if (!db.goals.length) {
      html += '<div class="empty"><div class="empty__ico">🎯</div><div class="empty__title">Целей пока нет</div>' +
        '<div class="empty__text">Создайте первую цель и разбейте её на этапы — прогресс будет считаться сам.</div></div>';
      el.innerHTML = html;
      el.querySelector('#btn-new-goal').addEventListener('click', openGoalForm);
      return;
    }

    html += db.goals.map(function (g) {
      var p = goalProgress(g);
      var dl = daysLeft(g.deadline);
      var isDone = !!g.completedAt;
      var isOver = !isDone && dl !== null && dl < 0;
      var stagesHtml = g.stages.map(function (s) {
        return '<div class="stage-row">' +
          '<button class="stage-check' + (s.done ? ' is-on' : '') + '" data-stage="' + s.id + '" data-goal="' + g.id + '" title="Отметить этап">✓</button>' +
          '<span class="stage-title' + (s.done ? ' is-done' : '') + '">' + esc(s.title) + '</span>' +
        '</div>';
      }).join('');
      return '<div class="goal-card' + (isDone ? ' is-done' : '') + (isOver ? ' is-over' : '') + '" data-g="' + g.id + '">' +
        '<div class="goal-head">' +
          '<div style="flex:1;min-width:0">' +
            '<div class="goal-title">' + esc(g.title) + '</div>' +
            (g.why ? '<div class="goal-why">' + esc(g.why) + '</div>' : '') +
          '</div>' +
          '<div class="goal-actions">' +
            '<button class="icon-btn" data-edit="' + g.id + '" title="Редактировать">✏️</button>' +
            '<button class="icon-btn" data-del="' + g.id + '" title="Удалить">🗑</button>' +
          '</div>' +
        '</div>' +
        '<div class="goal-meta">' +
          (isDone ? '<span class="badge badge--mint">✓ Выполнено ' + fmtDate(todayStr()) + '</span>'
            : (isOver ? '<span class="badge badge--coral">⏰ Дедлайн прошёл ' + fmtDate(g.deadline) + '</span>'
            : (dl !== null ? '<span class="badge badge--indigo">📅 до ' + fmtDate(g.deadline) + ' · ' + dl + ' ' + plural(dl, ['день', 'дня', 'дней']) + '</span>'
            : '<span class="badge badge--gray">без дедлайна</span>'))) +
          '<span class="badge ' + (p.pct === 100 ? 'badge--mint' : 'badge--amber') + '">' + p.done + '/' + p.total + ' этапов · ' + p.pct + '%</span>' +
        '</div>' +
        '<div class="row" style="margin-top:10px"><div class="progress"><div class="progress__bar' + (p.pct === 100 ? ' is-full' : '') + '" style="width:' + p.pct + '%"></div></div></div>' +
        (stagesHtml ? '<div class="stages">' + stagesHtml + '</div>' : '') +
      '</div>';
    }).join('');

    el.innerHTML = html;
    el.querySelector('#btn-new-goal').addEventListener('click', openGoalForm);
    el.querySelectorAll('[data-stage]').forEach(function (b) {
      b.addEventListener('click', function () {
        toggleStage(b.dataset.goal, b.dataset.stage);
        app.render();
      });
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = db.goals.find(function (x) { return x.id === b.dataset.del; });
        confirmDlg('Удалить цель', 'Удалить цель «' + esc(g.title) + '» и все её этапы?', 'Удалить', function () {
          deleteGoal(g.id);
          toast('Цель удалена');
          app.render();
        });
      });
    });
    el.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = db.goals.find(function (x) { return x.id === b.dataset.edit; });
        openGoalForm(g);
      });
    });
  }

  function openGoalForm(existing) {
    var isEdit = !!existing;
    var m = modal(isEdit ? 'Редактировать цель' : 'Новая цель',
      '<div class="field"><label class="field__label">Название цели<span class="req">*</span></label>' +
      '<input class="input" id="gf-title" maxlength="100" value="' + esc(isEdit ? existing.title : '') + '" placeholder="Например: Подготовиться к полумарафону"></div>' +
      '<div class="field"><label class="field__label">Зачем мне это (мотивация)</label>' +
      '<input class="input" id="gf-why" maxlength="140" value="' + esc(isEdit ? existing.why : '') + '" placeholder="Одной фразой — ради чего идёте"></div>' +
      '<div class="field"><label class="field__label">Дедлайн</label>' +
      '<input type="date" class="input" id="gf-deadline" value="' + (isEdit && existing.deadline ? existing.deadline : '') + '"></div>' +
      (!isEdit
        ? '<div class="field"><label class="field__label">Этапы — по одному в строке<span class="req">*</span></label>' +
          '<textarea class="input" id="gf-stages" rows="4" placeholder="Купить форму&#10;Тренировки 3 раза в неделю&#10;Пробежать 10 км"></textarea>' +
          '<div class="field__hint">Прогресс считается автоматически по выполненным этапам.</div></div>'
        : ''),
      '<button class="btn btn--ghost" data-cancel>Отмена</button>' +
      '<button class="btn btn--primary" data-save>' + (isEdit ? 'Сохранить' : 'Создать цель') + '</button>');
    m.querySelector('[data-cancel]').addEventListener('click', closeModal);
    m.querySelector('[data-save]').addEventListener('click', function () {
      var data = {
        title: m.querySelector('#gf-title').value,
        why: m.querySelector('#gf-why').value,
        deadline: m.querySelector('#gf-deadline').value || null,
        stagesRaw: isEdit ? '' : m.querySelector('#gf-stages').value
      };
      if (!data.title.trim()) { toast('Укажите название цели', 'error'); return; }
      if (isEdit) {
        updateGoal(existing.id, data);
        toast('Цель обновлена', 'ok');
      } else {
        if (!addGoal(data)) { toast('Добавьте хотя бы один этап', 'error'); return; }
        toast('Цель создана — первый шаг ждёт!', 'ok');
      }
      closeModal();
      app.render();
    });
  }

  function renderDiary(el) {
    var html = '<div class="page-head">' +
      '<div><div class="page-head__title">Дневник настроения</div>' +
      '<div class="page-head__sub">Короткая заметка о состоянии — пригодится на сессии с коучем</div></div>' +
      '</div>';

    var week = db.diary.filter(function (d) { return d.ts >= Date.now() - 7 * DAY; });
    var avg = week.length ? (week.reduce(function (s, d) { return s + d.mood; }, 0) / week.length) : null;
    html += '<div class="card" style="padding:18px 20px;margin-bottom:18px">' +
      '<div class="field"><label class="field__label">Как настроение сегодня?</label><div class="mood-picker" id="mood-picker">' +
      MOODS.map(function (m, i) { return '<button type="button" class="mood-btn' + (i === 3 ? ' is-picked' : '') + '" data-mood="' + m.v + '" title="' + m.label + '">' + m.e + '</button>'; }).join('') +
      '</div></div>' +
      '<div class="field"><label class="field__label">Комментарий (необязательно)</label>' +
      '<textarea class="input" id="diary-text" rows="2" placeholder="Что повлияло на настроение?"></textarea></div>' +
      '<button class="btn btn--primary" id="diary-add">Добавить запись</button>' +
      (avg !== null ? '<div class="field__hint" style="margin-top:10px">Среднее настроение за 7 дней: <b>' + avg.toFixed(1) + '</b> из 5 (' + week.length + ' ' + plural(week.length, ['запись', 'записи', 'записей']) + ')</div>' : '') +
    '</div>';

    if (!db.diary.length) {
      html += '<div class="empty"><div class="empty__ico">📓</div><div class="empty__title">Записей пока нет</div>' +
        '<div class="empty__text">Первая запись — самый важный шаг дневника.</div></div>';
    } else {
      html += db.diary.map(function (d) {
        var m = MOODS.find(function (x) { return x.v === d.mood; }) || MOODS[2];
        var dstr = fmtDate(todayStr()) === fmtDate(new Date(d.ts).toISOString().slice(0, 10)) ? 'сегодня' : fmtDate(new Date(d.ts).toISOString().slice(0, 10));
        return '<div class="diary-entry">' +
          '<span class="diary-entry__mood">' + m.e + '</span>' +
          '<div style="flex:1;min-width:0"><div class="diary-entry__date">' + dstr + ' · ' + m.label + '</div>' +
          (d.text ? '<div class="diary-entry__text">' + esc(d.text) + '</div>' : '') + '</div>' +
          '<button class="icon-btn" data-del-d="' + d.id + '" title="Удалить">🗑</button>' +
        '</div>';
      }).join('');
    }
    el.innerHTML = html;

    var picked = 4;
    el.querySelectorAll('.mood-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        el.querySelectorAll('.mood-btn').forEach(function (x) { x.classList.remove('is-picked'); });
        b.classList.add('is-picked');
        picked = +b.dataset.mood;
      });
    });
    el.querySelector('#diary-add').addEventListener('click', function () {
      addDiary(picked, el.querySelector('#diary-text').value);
      toast('Запись добавлена — спасибо, что следите за собой', 'ok');
      app.render();
    });
    el.querySelectorAll('[data-del-d]').forEach(function (b) {
      b.addEventListener('click', function () {
        confirmDlg('Удалить запись', 'Удалить эту запись дневника?', 'Удалить', function () {
          deleteDiary(b.dataset.delD);
          app.render();
        });
      });
    });
  }

  function renderOverview(el) {
    var st = stats();
    var best = db.goals.map(function (g) { return { g: g, p: goalProgress(g) }; })
      .filter(function (x) { return !x.g.completedAt; })
      .sort(function (a, b) { return b.p.pct - a.p.pct; })[0];
    var moodEmoji = st.moodAvg === null ? '—' : st.moodAvg >= 4.5 ? '😄' : st.moodAvg >= 3.5 ? '🙂' : st.moodAvg >= 2.5 ? '😐' : '😕';

    var html = '<div class="page-head"><div><div class="page-head__title">Обзор</div>' +
      '<div class="page-head__sub">Картина вашего пути в цифрах</div></div></div>';

    html += '<div class="motivation"><span class="star">⭐</span><span>' +
      (best ? 'Ближе всего к цели: «' + esc(best.g.title) + '» — ' + best.p.pct + '%. Минус один шаг до результата!'
        : 'Каждый день — новый шаг. Начните с первой цели!') + '</span></div>';

    html += '<div class="stats">' +
      stat(st.active, 'Активные цели') +
      stat(st.done, 'Выполнено целей') +
      stat(st.stagesDone + ' / ' + st.stagesTotal, 'Этапов выполнено') +
      (st.moodAvg !== null ? '<div class="stat"><div class="stat__num"><span class="mood-emoji">' + moodEmoji + '</span> ' + st.moodAvg.toFixed(1) + '</div><div class="stat__label">Настроение за 7 дней</div></div>' : stat('—', 'Настроение за 7 дней')) +
      (st.over ? '<div class="stat" style="border-color:rgba(232,93,74,.4)"><div class="stat__num" style="color:var(--coral)">' + st.over + '</div><div class="stat__label">Целей с просроченным дедлайном</div></div>' : '') +
    '</div>';

    html += '<div class="section-title">Все цели</div>';
    html += (db.goals.length ? db.goals.map(function (g) {
      var p = goalProgress(g);
      return '<div class="diary-entry"><span style="font-size:20px">' + (g.completedAt ? '✅' : '🎯') + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:600">' + esc(g.title) + '</div>' +
        '<div class="row" style="margin-top:6px"><div class="progress"><div class="progress__bar' + (p.pct === 100 ? ' is-full' : '') + '" style="width:' + p.pct + '%"></div></div>' +
        '<span class="muted" style="font-size:12px;flex:none">' + p.pct + '%</span></div></div>' +
        '<span class="badge ' + (g.completedAt ? 'badge--mint' : 'badge--indigo') + '">' + (g.completedAt ? 'выполнено' : p.pct + '%') + '</span>' +
      '</div>';
    }).join('') : '<p class="muted">Целей пока нет.</p>');

    html += '<div class="divider"></div><p class="muted">💾 Данные хранятся в вашем браузере. ' +
      'Для сессии с коучем выгрузите их кнопкой «Экспорт» в шапке — получится JSON-файл.</p>';

    el.innerHTML = html;

    function stat(num, label) {
      return '<div class="stat"><div class="stat__num">' + num + '</div><div class="stat__label">' + label + '</div></div>';
    }
  }

  /* ---------- модалки ---------- */
  function modal(title, body, footer) {
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="modal"><div class="modal__head"><div class="modal__title">' + title + '</div>' +
      '<button class="icon-btn modal__close">✕</button></div>' +
      '<div class="modal__body">' + body + '</div>' +
      (footer ? '<div class="modal__foot">' + footer + '</div>' : '') + '</div>';
    document.body.appendChild(ov);
    ov.querySelector('.modal__close').addEventListener('click', closeModal);
    ov.addEventListener('pointerdown', function (e) { if (e.target === ov && window.innerWidth > 760) closeModal(); });
    var first = ov.querySelector('input, textarea');
    if (first) setTimeout(function () { first.focus(); }, 60);
    return ov;
  }
  function closeModal() { document.querySelectorAll('.overlay').forEach(function (o) { o.remove(); }); }
  function confirmDlg(title, text, okLabel, onOk) {
    var m = modal(title, '<p style="font-size:14px;color:var(--text-2)">' + text + '</p>',
      '<button class="btn btn--ghost" data-cancel>Отмена</button>' +
      '<button class="btn btn--danger" data-ok>' + okLabel + '</button>');
    m.querySelector('[data-cancel]').addEventListener('click', closeModal);
    m.querySelector('[data-ok]').addEventListener('click', function () { closeModal(); onOk(); });
  }

  /* ---------- запуск ---------- */
  function boot() {
    load();
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
    app.render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
