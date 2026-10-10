/* ===== ゆめかわ家計簿 ===== */
(() => {
  'use strict';

  // ---------- 定数 ----------
  const STORAGE_KEY = 'yumekawa-kakeibo-v1';

  const CATEGORIES = [
    { id: 'food',    name: '食費',   emoji: '🍙', color: '#ff9eb5' },
    { id: 'cafe',    name: 'カフェ', emoji: '☕', color: '#d9a983' },
    { id: 'daily',   name: '日用品', emoji: '🧴', color: '#7fd6c2' },
    { id: 'transit', name: '交通',   emoji: '🚃', color: '#8fb8ff' },
    { id: 'beauty',  name: '美容',   emoji: '💄', color: '#e6a3ff' },
    { id: 'hobby',   name: '趣味',   emoji: '🎀', color: '#ffcf70' },
    { id: 'fixed',   name: '固定費', emoji: '🏠', color: '#a49fe0' },
    { id: 'other',   name: 'その他', emoji: '✨', color: '#c4c2cf' },
  ];
  const INCOME_CAT = { id: 'income', name: '収入', emoji: '💰', color: '#5fd3b0' };

  const METHODS = {
    credit: { name: 'クレカ' },
    bank:   { name: '銀行' },
    cash:   { name: '現金' },
  };

  const DEFAULT_FAVORITES = [
    { label: 'コンビニ', amount: 500,  category: 'food' },
    { label: 'カフェ',   amount: 600,  category: 'cafe' },
    { label: 'ランチ',   amount: 1000, category: 'food' },
    { label: '電車',     amount: 200,  category: 'transit' },
  ];

  // いちばん多かったカテゴリへのやさしい一言
  const TOP_CATEGORY_MESSAGES = {
    food:    'いちばん多かったのは「食費」だったよ。おいしいもの、たくさん食べられたね🍙',
    cafe:    'いちばん多かったのは「カフェ」だったよ。ほっとひと息つけたなら、それも大事な時間☕',
    daily:   'いちばん多かったのは「日用品」だったよ。おうちのこと、ちゃんとそろえてえらいね🧴',
    transit: 'いちばん多かったのは「交通」だったよ。たくさんおでかけ、おつかれさま🚃',
    beauty:  'いちばん多かったのは「美容」だったよ。かわいくなるのも、自分を大切にすることだよ💄',
    hobby:   'いちばん多かったのは「趣味」だったよ。好きなことでいっぱい楽しめたね🎀',
    fixed:   'いちばん多かったのは「固定費」だったよ。支払いが重なっただけかも。気にしすぎないでね🏠',
    other:   'いちばん多かったのは「その他」だったよ。いろいろあった一週間だったね✨',
  };

  // ---------- ユーティリティ ----------
  const $ = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const catById = (id) => (id === 'income' ? INCOME_CAT : CATEGORIES.find((c) => c.id === id) || CATEGORIES[7]);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const toHalfWidthDigits = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

  // ---------- データ ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        return {
          budget: Number(s.budget) > 0 ? Number(s.budget) : 100000,
          entries: Array.isArray(s.entries) ? s.entries : [],
          favorites: Array.isArray(s.favorites) ? s.favorites : [],
          lastMethod: s.lastMethod || 'credit',
          overShownWeek: s.overShownWeek || '',
        };
      }
    } catch (e) {
      console.warn('データの読み込みに失敗しました', e);
    }
    return {
      budget: 100000,
      entries: [],
      favorites: DEFAULT_FAVORITES.map((f) => ({ id: uid(), ...f })),
      lastMethod: 'credit',
      overShownWeek: '',
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      showToast('保存できなかったよ…容量を確認してね');
    }
  }

  let state = loadState();

  // ---------- 集計 ----------
  function monthStats(now = new Date()) {
    const mk = monthKey(now);
    const monthEntries = state.entries.filter((e) => e.date.startsWith(mk));
    const expenses = monthEntries.filter((e) => e.type === 'expense');
    const spent = expenses.reduce((a, e) => a + e.amount, 0);
    const income = monthEntries.filter((e) => e.type === 'income').reduce((a, e) => a + e.amount, 0);

    const byMethod = { credit: 0, bank: 0, cash: 0 };
    const byCategory = {};
    for (const e of expenses) {
      if (byMethod[e.method] !== undefined) byMethod[e.method] += e.amount;
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    }
    return { spent, income, byMethod, byCategory, count: monthEntries.length };
  }

  // 週（月曜はじまり）の集計。週の予算 = 月の予算 × 7 ÷ その月の日数
  function weekStats(now = new Date()) {
    const start = new Date(now);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const startKey = dateKey(start);
    const todayKey = dateKey(now);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const weekBudget = Math.round((state.budget * 7) / daysInMonth);

    const byCategory = {};
    let spent = 0;
    for (const e of state.entries) {
      if (e.type !== 'expense' || e.date < startKey || e.date > todayKey) continue;
      spent += e.amount;
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    }
    const top = Object.keys(byCategory).sort((a, b) => byCategory[b] - byCategory[a])[0] || null;
    return { weekKey: startKey, spent, weekBudget, top, over: spent > weekBudget };
  }

  // 連続記録日数：きょう（まだならきのう）からさかのぼって数える
  function calcStreak() {
    const days = new Set(state.entries.map((e) => e.date));
    const d = new Date();
    if (!days.has(dateKey(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(dateKey(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  // ---------- ホーム描画 ----------
  function renderHome() {
    const now = new Date();
    const { spent, income, byMethod, byCategory, count } = monthStats(now);
    const budget = state.budget;
    const remaining = budget - spent;
    const usage = budget > 0 ? spent / budget : 0;

    $('#month-label').textContent = `${now.getFullYear()}年${now.getMonth() + 1}月`;

    // 残り予算
    const remEl = $('#remaining');
    remEl.innerHTML = (remaining < 0 ? '-' : '') + '<span class="yen">¥</span>' + Math.abs(remaining).toLocaleString('ja-JP');
    remEl.classList.toggle('over', remaining < 0);

    // 使用率バー
    const pct = Math.round(usage * 100);
    const fill = $('#usage-fill');
    fill.style.width = Math.min(100, pct) + '%';
    fill.classList.toggle('warn', usage >= 0.8 && usage < 1);
    fill.classList.toggle('over', usage >= 1);
    $('#usage-bar').setAttribute('aria-valuenow', String(Math.min(100, pct)));
    $('#usage-percent').textContent = pct + '%';
    $('#used-amount').textContent = yen(spent);
    $('#budget-amount').textContent = yen(budget);

    // 連続記録
    $('#streak-days').textContent = calcStreak();

    // 収入
    const incomeLine = $('#income-line');
    incomeLine.hidden = income <= 0;
    incomeLine.innerHTML = `今月の収入 <b>${yen(income)}</b>`;

    // 支払い方法別
    $('#sum-credit').textContent = yen(byMethod.credit);
    $('#sum-bank').textContent = yen(byMethod.bank);
    $('#sum-cash').textContent = yen(byMethod.cash);

    $('#week-alert').hidden = !weekStats(now).over;

    renderWanko(now, spent, budget, count);
    renderPie(byCategory, spent);
    renderTodayList(now);
  }

  // 予算の状況でわんこの表情とセリフを変える
  function renderWanko(now, spent, budget, count) {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const pace = now.getDate() / daysInMonth;           // 月の経過割合
    const usage = budget > 0 ? spent / budget : 0;

    let img = 'normal';
    let serif;
    if (count === 0) {
      serif = 'はじめまして！いっしょに記録していこうね♡';
    } else if (usage >= 1) {
      img = 'sad';
      serif = '予算こえちゃった…でも気づけたのがえらいよ';
    } else if (usage > pace + 0.1 || weekStats(now).over) {
      img = 'sad';
      serif = 'ちょっとペースはやめかも…いっしょにゆっくりいこ';
    } else if (usage > pace) {
      img = 'normal';
      serif = 'いい感じ！このままのんびりいこうね';
    } else {
      img = 'smile';
      serif = '予算内でえらい！そのちょうしだよ♡';
    }
    const el = $('#home-wanko');
    el.src = `images/wanko_${img}.png`;
    el.alt = { normal: 'ふつうの顔のわんこ', smile: 'にっこりわんこ', sad: 'こまり顔のわんこ' }[img];
    $('#home-serif').textContent = serif;
  }

  function renderPie(byCategory, total) {
    const wrap = $('#pie-wrap');
    const empty = $('#pie-empty');
    if (total <= 0) {
      wrap.hidden = true;
      empty.hidden = false;
      return;
    }
    wrap.hidden = false;
    empty.hidden = true;

    const items = CATEGORIES
      .map((c) => ({ ...c, amount: byCategory[c.id] || 0 }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    // conic-gradientでドーナツを描く（すき間を白で入れる）
    let acc = 0;
    const stops = [];
    const gap = items.length > 1 ? 0.6 : 0; // 度
    for (const it of items) {
      const start = (acc / total) * 360;
      acc += it.amount;
      const end = (acc / total) * 360;
      stops.push(`${it.color} ${start}deg ${Math.max(start, end - gap)}deg`);
      if (gap) stops.push(`#fff ${Math.max(start, end - gap)}deg ${end}deg`);
    }
    $('#donut').style.background = `conic-gradient(${stops.join(',')})`;
    $('#donut-total').textContent = yen(total);

    $('#legend').innerHTML = items.map((it) => `
      <li>
        <span class="sw" style="background:${it.color}"></span>
        <span class="nm">${it.emoji} ${it.name}</span>
        <span class="am">${yen(it.amount)}</span>
        <span class="pc">${Math.round((it.amount / total) * 100)}%</span>
      </li>`).join('');
  }

  function renderTodayList(now) {
    const today = dateKey(now);
    const list = state.entries
      .filter((e) => e.date === today)
      .sort((a, b) => b.createdAt - a.createdAt);
    $('#today-empty').hidden = list.length > 0;
    $('#today-list').innerHTML = list.map((e) => {
      const c = catById(e.category);
      const isIncome = e.type === 'income';
      return `
        <li class="entry">
          <span class="entry-icon" style="background:${c.color}33">${c.emoji}</span>
          <div class="entry-main">
            <div class="entry-cat">${c.name}</div>
            <div class="entry-sub"><span class="entry-method ${e.method}">${METHODS[e.method]?.name || ''}</span>${escapeHtml(e.memo || '')}</div>
          </div>
          <span class="entry-amount ${isIncome ? 'income' : ''}">${isIncome ? '+' : ''}${yen(e.amount)}</span>
          <button class="entry-del" data-id="${e.id}" aria-label="この記録を消す">×</button>
        </li>`;
    }).join('');
  }

  $('#today-list').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.entry-del');
    if (!btn) return;
    if (!confirm('この記録を消してもいい？')) return;
    state.entries = state.entries.filter((e) => e.id !== btn.dataset.id);
    saveState();
    renderHome();
    showToast('消したよ');
  });

  // ---------- 記録する画面 ----------
  const form = { type: 'expense', category: null, method: state.lastMethod };
  let favEditMode = false;

  function resetForm() {
    form.type = 'expense';
    form.category = null;
    form.method = state.lastMethod;
    favEditMode = false;
    $('#amount-input').value = '';
    $('#memo-input').value = '';
    renderRecord();
  }

  function renderRecord() {
    document.querySelectorAll('.seg-btn').forEach((b) => {
      const on = b.dataset.type === form.type;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const isExpense = form.type === 'expense';
    $('#category-section').hidden = !isExpense;
    $('#fav-section').hidden = !isExpense;
    $('#method-title').textContent = isExpense ? '支払い方法' : '受け取り方法';

    $('#cat-grid').innerHTML = CATEGORIES.map((c) => `
      <button class="cat-btn ${form.category === c.id ? 'selected' : ''}" data-cat="${c.id}" style="--cat-color:${c.color}" aria-pressed="${form.category === c.id}">
        <span class="emoji">${c.emoji}</span>${c.name}
      </button>`).join('');

    document.querySelectorAll('.method-btn').forEach((b) => {
      const on = b.dataset.method === form.method;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    renderFavorites();
  }

  function renderFavorites() {
    $('#btn-fav-edit').textContent = favEditMode ? 'おわる' : 'へんしゅう';
    $('#fav-hint').hidden = !favEditMode;
    const chips = state.favorites.map((f) => {
      const c = catById(f.category);
      return `<button class="chip ${favEditMode ? 'editing' : ''}" data-fav="${f.id}">
        <span>${c.emoji} ${escapeHtml(f.label)}</span><small>${yen(f.amount)}</small>
      </button>`;
    });
    chips.push('<button class="chip add" id="btn-fav-add">＋ ついか</button>');
    $('#fav-list').innerHTML = chips.join('');
  }

  document.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    form.type = b.dataset.type;
    renderRecord();
  }));

  $('#cat-grid').addEventListener('click', (ev) => {
    const b = ev.target.closest('.cat-btn');
    if (!b) return;
    form.category = b.dataset.cat;
    renderRecord();
  });

  $('#method-select').addEventListener('click', (ev) => {
    const b = ev.target.closest('.method-btn');
    if (!b) return;
    form.method = b.dataset.method;
    renderRecord();
  });

  $('#amount-input').addEventListener('input', (ev) => {
    const digits = toHalfWidthDigits(ev.target.value).replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
    ev.target.value = digits ? Number(digits).toLocaleString('ja-JP') : '';
  });

  const getAmount = () => Number(toHalfWidthDigits($('#amount-input').value).replace(/[^0-9]/g, '')) || 0;

  $('#fav-list').addEventListener('click', (ev) => {
    if (ev.target.closest('#btn-fav-add')) {
      openFavoriteSheet(null);
      return;
    }
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    const fav = state.favorites.find((f) => f.id === chip.dataset.fav);
    if (!fav) return;
    if (favEditMode) {
      openFavoriteSheet(fav);
      return;
    }
    form.type = 'expense';
    form.category = fav.category;
    $('#amount-input').value = fav.amount.toLocaleString('ja-JP');
    if (!$('#memo-input').value) $('#memo-input').value = fav.label;
    renderRecord();
    chip.classList.add('shake');
  });

  $('#btn-fav-edit').addEventListener('click', () => {
    favEditMode = !favEditMode;
    renderFavorites();
  });

  $('#btn-save').addEventListener('click', () => {
    const amount = getAmount();
    if (amount <= 0) {
      nudge('.amount-card', '金額を入れてね');
      $('#amount-input').focus();
      return;
    }
    if (form.type === 'expense' && !form.category) {
      nudge('#category-section', 'カテゴリをえらんでね');
      return;
    }
    if (!form.method) {
      nudge('#method-select', `${form.type === 'expense' ? '支払い' : '受け取り'}方法をえらんでね`);
      return;
    }

    const now = new Date();
    state.entries.push({
      id: uid(),
      type: form.type,
      amount,
      category: form.type === 'expense' ? form.category : 'income',
      method: form.method,
      memo: $('#memo-input').value.trim(),
      date: dateKey(now),
      createdAt: now.getTime(),
    });
    state.lastMethod = form.method;
    saveState();

    lastSaved = state.entries[state.entries.length - 1];
    sparkleBurst($('#btn-save'));
    // 記録画面を「記録できた！」に置きかえる（戻るボタンでホームに戻れるように）
    setTimeout(() => showResult('done'), 350);
  });

  function nudge(selector, message) {
    const el = $(selector);
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    showToast(message);
  }

  // ---------- シート（予算設定・よく使う編集） ----------
  function openSheet(title, bodyHtml, actions) {
    $('#sheet-title').textContent = title;
    $('#sheet-body').innerHTML = bodyHtml;
    const box = $('#sheet-actions');
    box.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = 'sheet-btn ' + (a.cls || '');
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      box.appendChild(b);
    }
    $('#sheet-backdrop').hidden = false;
  }
  const closeSheet = () => { $('#sheet-backdrop').hidden = true; };

  $('#sheet-backdrop').addEventListener('click', (ev) => {
    if (ev.target.id === 'sheet-backdrop') closeSheet();
  });

  function bindNumberInput(input) {
    input.addEventListener('input', () => {
      const d = toHalfWidthDigits(input.value).replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
      input.value = d ? Number(d).toLocaleString('ja-JP') : '';
    });
  }
  const parseNum = (v) => Number(toHalfWidthDigits(v).replace(/[^0-9]/g, '')) || 0;

  $('#btn-settings').addEventListener('click', () => {
    openSheet('今月の予算を決めよう ✦', `
      <label class="field">
        <span>1か月の予算（円）</span>
        <input id="budget-input" class="text-input" type="text" inputmode="numeric" value="${state.budget.toLocaleString('ja-JP')}">
      </label>`, [
      { label: 'やめる', onClick: closeSheet },
      {
        label: '保存する', cls: 'primary', onClick: () => {
          const v = parseNum($('#budget-input').value);
          if (v <= 0) { nudge('#budget-input', '金額を入れてね'); return; }
          state.budget = v;
          saveState();
          closeSheet();
          renderHome();
          showToast('予算を保存したよ♡');
        },
      },
    ]);
    bindNumberInput($('#budget-input'));
  });

  function openFavoriteSheet(fav) {
    const isNew = !fav;
    const f = fav || { label: '', amount: '', category: 'food' };
    const options = CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === f.category ? 'selected' : ''}>${c.emoji} ${c.name}</option>`).join('');
    const actions = [];
    if (!isNew) {
      actions.push({
        label: '消す', cls: 'danger', onClick: () => {
          if (!confirm(`「${f.label}」を消してもいい？`)) return;
          state.favorites = state.favorites.filter((x) => x.id !== f.id);
          saveState();
          closeSheet();
          renderFavorites();
        },
      });
    }
    actions.push({ label: 'やめる', onClick: closeSheet });
    actions.push({
      label: '保存する', cls: 'primary', onClick: () => {
        const label = $('#fav-label').value.trim();
        const amount = parseNum($('#fav-amount').value);
        if (!label) { nudge('#fav-label', 'なまえを入れてね'); return; }
        if (amount <= 0) { nudge('#fav-amount', '金額を入れてね'); return; }
        const category = $('#fav-cat').value;
        if (isNew) {
          state.favorites.push({ id: uid(), label, amount, category });
        } else {
          Object.assign(fav, { label, amount, category });
        }
        saveState();
        closeSheet();
        renderFavorites();
        showToast('保存したよ♡');
      },
    });

    openSheet(isNew ? '「よく使う」を追加' : '「よく使う」を編集', `
      <label class="field"><span>なまえ</span>
        <input id="fav-label" class="text-input" type="text" maxlength="12" placeholder="例：コンビニ" value="${escapeHtml(f.label)}">
      </label>
      <label class="field"><span>金額（円）</span>
        <input id="fav-amount" class="text-input" type="text" inputmode="numeric" placeholder="500" value="${f.amount ? Number(f.amount).toLocaleString('ja-JP') : ''}">
      </label>
      <label class="field"><span>カテゴリ</span>
        <select id="fav-cat" class="text-input select">${options}</select>
      </label>`, actions);
    bindNumberInput($('#fav-amount'));
  }

  // ---------- 記録できた！／使いすぎお知らせ ----------
  let lastSaved = null;

  function renderDone() {
    const e = lastSaved;
    const c = catById(e.category);
    const isIncome = e.type === 'income';
    const amountEl = $('#done-amount');
    amountEl.textContent = (isIncome ? '+' : '') + yen(e.amount);
    amountEl.classList.toggle('income', isIncome);
    $('#done-sub').textContent = [`${c.emoji} ${c.name}`, METHODS[e.method]?.name, e.memo].filter(Boolean).join('・');
    $('#done-streak').textContent = calcStreak();

    const w = weekStats();
    let msg;
    if (isIncome) msg = '収入もきろくできてえらい！';
    else if (w.over) msg = '';
    else msg = `今週はあと ${yen(w.weekBudget - w.spent)} 使えるよ。いい感じ♡`;
    $('#done-msg').textContent = msg;
    // 週の予算を超えていて、今週まだお知らせしていなければ次はお知らせ画面へ
    $('#btn-done-next').textContent = needOverNotice() ? 'つぎへ ›' : 'ホームにもどる ♡';
  }

  const needOverNotice = () => {
    const w = weekStats();
    return w.over && state.overShownWeek !== w.weekKey;
  };

  function renderOver() {
    const w = weekStats();
    $('#over-spent').textContent = yen(w.spent);
    $('#over-budget').textContent = yen(w.weekBudget);
    $('#over-diff').textContent = w.over ? `${yen(w.spent - w.weekBudget)} オーバー` : `あと ${yen(w.weekBudget - w.spent)}`;
    $('#over-msg').textContent = w.top ? TOP_CATEGORY_MESSAGES[w.top] || '' : '';
    state.overShownWeek = w.weekKey;
    saveState();
  }

  $('#btn-done-next').addEventListener('click', () => {
    if (needOverNotice()) showResult('over');
    else goHome();
  });
  $('#btn-over-ok').addEventListener('click', goHome);
  $('#week-alert').addEventListener('click', () => {
    openedFromHome = true;
    location.hash = 'over';
  });

  // ---------- 画面切り替え（#record / #done / #over。スマホの戻るボタンにも対応） ----------
  let openedFromHome = false;
  const VIEWS = ['home', 'record', 'done', 'over'];

  function currentView() {
    const v = location.hash.slice(1);
    if (v === 'done' && !lastSaved) return 'home'; // 再読み込みなどで内容がないとき
    return VIEWS.includes(v) ? v : 'home';
  }

  function route() {
    const view = currentView();
    for (const v of VIEWS) $('#view-' + v).hidden = v !== view;
    closeSheet();
    if (view === 'record') resetForm();
    else if (view === 'done') renderDone();
    else if (view === 'over') renderOver();
    else renderHome();
    window.scrollTo(0, 0);
  }

  // 今の画面を置きかえて表示（履歴を増やさない）
  function showResult(view) {
    history.replaceState(null, '', '#' + view);
    route();
  }

  function goHome() {
    if (openedFromHome) {
      openedFromHome = false;
      history.back();
    } else {
      history.replaceState(null, '', location.pathname + location.search);
      route();
    }
  }

  $('#btn-go-record').addEventListener('click', () => {
    openedFromHome = true;
    location.hash = 'record';
  });
  $('#btn-back').addEventListener('click', goHome);
  window.addEventListener('hashchange', route);

  // 日付が変わったときやアプリに戻ってきたときに更新
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentView() === 'home') renderHome();
  });

  // ---------- 演出 ----------
  let toastTimer;
  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function sparkleBurst(origin) {
    const r = origin.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const marks = ['✦', '♡', '✧', '♥', '✦', '✧', '♡', '✦', '♥', '✧'];
    const colors = ['#ff8fc1', '#c39bff', '#8fcaff', '#ffcf70', '#5fd3b0'];
    marks.forEach((m, i) => {
      const s = document.createElement('span');
      s.className = 'burst';
      s.textContent = m;
      const ang = (i / marks.length) * Math.PI * 2;
      const dist = 70 + Math.random() * 50;
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.color = colors[i % colors.length];
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist - 40 + 'px');
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1000);
    });
  }

  // ---------- 起動 ----------
  saveState(); // 初回はよく使うの初期値を保存
  route();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
