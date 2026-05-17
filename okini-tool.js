(function () {
  'use strict';
  if (window.__okiniTool) { alert('オキニ送信ツールは既に起動しています'); return; }
  window.__okiniTool = true;

  var ORIGIN = 'https://spgirl.cityheaven.net';
  var K_SENT = 'okini-sent-users';
  var K_SKIP = 'okini-skipped-users';
  var K_LOGS = 'okini-send-logs';
  var K_TPL = 'okini-templates';
  var LOG_MAX = 200;

  /* ---------- localStorage ---------- */
  function lsGet(k, def) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function getSent() { return lsGet(K_SENT, {}); }
  function markSent(id) { var s = getSent(); s[id] = new Date().toISOString(); lsSet(K_SENT, s); }
  function getSkipped() { return lsGet(K_SKIP, {}); }
  function setSkipped(ids) { var s = getSkipped(); ids.forEach(function (id) { s[id] = new Date().toISOString(); }); lsSet(K_SKIP, s); }
  function getTpls() { return lsGet(K_TPL, []); }
  function setTpls(v) { lsSet(K_TPL, v); }
  function addLog(entry) {
    var logs = lsGet(K_LOGS, []);
    logs.unshift(entry);
    if (logs.length > LOG_MAX) logs = logs.slice(0, LOG_MAX);
    lsSet(K_LOGS, logs);
  }

  /* ---------- utils ---------- */
  function rnd(min, max) { return new Promise(function (r) { setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min); }); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  function parseJaDate(str) {
    if (!str) return null;
    str = str.trim();
    var m = str.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) { var y = new Date().getFullYear(); return new Date(y, +m[1] - 1, +m[2], +(m[3] || 0), +(m[4] || 0)); }
    m = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }

  function findGid() {
    var m = location.href.match(/[?&]gid=(\d+)/); if (m) return m[1];
    var el = document.querySelector('#gid, input[name="gid"]'); if (el && el.value) return el.value;
    var a = document.querySelector('a[href*="gid="]'); if (a) { var mm = a.href.match(/gid=(\d+)/); if (mm) return mm[1]; }
    var f = document.querySelector('form[action*="gid="]'); if (f) { var fm = f.action.match(/gid=(\d+)/); if (fm) return fm[1]; }
    return null;
  }

  /* リダイレクト耐性：毎tick contentDocument を取り直してセレクタ出現を待つ */
  function loadAndPoll(ifr, url, selector, maxTries) {
    return new Promise(function (resolve) {
      var n = 0;
      try { ifr.src = url; } catch (e) {}
      var iv = setInterval(function () {
        n++;
        var d = null, el = null;
        try { d = ifr.contentDocument; } catch (e) {}
        if (d) { try { el = d.querySelector(selector); } catch (e) {} }
        if (el || n >= maxTries) {
          clearInterval(iv);
          var w = null; try { w = ifr.contentWindow; } catch (e) {}
          resolve({ doc: d, win: w, el: el, timedout: !el });
        }
      }, 500);
    });
  }

  /* ---------- iframe ---------- */
  var ifr = document.createElement('iframe');
  ifr.style.cssText = 'width:1px;height:1px;opacity:0;position:absolute;left:-9999px;border:0';
  document.body.appendChild(ifr);

  /* ---------- UI ---------- */
  var gid = findGid();
  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:6px;left:6px;right:6px;z-index:2147483647;background:#fff;border:2px solid #e84575;border-radius:12px;font:13px/1.55 -apple-system,sans-serif;color:#1a1a2e;max-height:88vh;overflow:auto;box-shadow:0 8px 28px rgba(0,0,0,.35)';
  panel.innerHTML =
    '<div id="ok-h" style="position:sticky;top:0;background:#e84575;color:#fff;font-weight:700;display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:10px 10px 0 0">' +
      '<span>オキニトーク 一斉送信</span>' +
      '<span><button id="ok-min" style="border:0;background:rgba(255,255,255,.25);color:#fff;border-radius:6px;padding:2px 9px;margin-right:6px;font-size:14px">＿</button>' +
      '<button id="ok-x" style="border:0;background:rgba(255,255,255,.25);color:#fff;border-radius:6px;padding:2px 9px;font-size:14px">×</button></span></div>' +
    '<div id="ok-body" style="padding:12px">' +
      '<div id="ok-gid" style="font-size:11px;color:#6b7280;margin-bottom:8px"></div>' +
      '<label style="font-weight:700">テンプレート</label>' +
      '<div style="display:flex;gap:6px;margin:6px 0">' +
        '<select id="ok-tpl" style="flex:1;min-width:0;padding:6px;border:1px solid #e5e7eb;border-radius:6px"></select>' +
        '<button id="ok-tpl-save" type="button" style="padding:6px 10px;border:1px solid #c7d2fe;background:#eef2ff;color:#4338ca;border-radius:6px;font-size:12px;white-space:nowrap">保存</button>' +
        '<button id="ok-tpl-del" type="button" style="padding:6px 10px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:6px;font-size:12px;white-space:nowrap">削除</button>' +
      '</div>' +
      '<label style="font-weight:700">メッセージ</label>' +
      '<textarea id="ok-msg" maxlength="500" rows="4" placeholder="送信するメッセージを入力" style="width:100%;box-sizing:border-box;margin:6px 0;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font:13px sans-serif"></textarea>' +
      '<div style="text-align:right;font-size:11px;color:#6b7280"><span id="ok-cc">0</span>/500</div>' +
      '<div style="margin:6px 0 2px"><button id="ok-var-name" type="button" style="padding:7px 12px;border:1px solid #c7d2fe;background:#eef2ff;color:#4338ca;border-radius:999px;font-size:12px;font-weight:700">👤 お客様のお名前を入れる</button></div>' +
      '<div style="font-size:11px;color:#6b7280;margin-bottom:6px">↑押すと文に <b>{名前}</b> が入ります。送信するときに、お客様ごとのお名前へ自動で変わります（例：「{名前}さん こんばんは」→「たろうさん こんばんは」）</div>' +
      '<div style="margin:10px 0;padding:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px">' +
        '<div style="font-weight:700;margin-bottom:6px">絞り込み</div>' +
        '<label style="display:block;margin:4px 0">送信対象 ' +
          '<select id="ok-mode" style="width:100%;padding:6px;border:1px solid #e5e7eb;border-radius:6px">' +
          '<option value="all">全員</option><option value="pin-only">ピン留めのみ</option><option value="pin-exclude">ピン留め以外</option></select></label>' +
        '<label style="display:block;margin:6px 0">取得人数 ' +
          '<select id="ok-limit" style="width:100%;padding:6px;border:1px solid #e5e7eb;border-radius:6px">' +
          '<option value="30">30人</option><option value="50" selected>50人</option><option value="100">100人</option><option value="0">制限なし</option><option value="custom">カスタム</option></select></label>' +
        '<div id="ok-limit-cw" style="display:none;margin:2px 0 6px"><input id="ok-limit-cv" type="number" min="1" max="9999" placeholder="人数" style="width:110px;padding:6px;border:1px solid #e5e7eb;border-radius:6px"> 人</div>' +
        '<label style="display:block;margin:6px 0"><input type="checkbox" id="ok-rep"> リピーター除外（予約 <select id="ok-repn" style="padding:3px"><option>1</option><option>2</option><option selected>3</option><option>5</option></select>回以上）</label>' +
        '<label style="display:block;margin:6px 0"><input type="checkbox" id="ok-rec"> 最近やり取りした人を除外（<select id="ok-recd" style="padding:3px"><option>1</option><option selected>3</option><option>7</option><option>14</option><option>30</option></select>日以内）</label>' +
        '<label style="display:block;margin:6px 0;color:#9ca3af"><input type="checkbox" checked disabled> 未読がある人はスキップ（必須）</label>' +
        '<label style="display:block;margin:6px 0"><input type="checkbox" id="ok-fresh"> 新規送信（送信済み履歴をリセット）</label>' +
      '</div>' +
      '<button id="ok-fetch" style="width:100%;padding:12px;font-weight:700;color:#fff;background:#6c5ce7;border:0;border-radius:8px">対象者を取得</button>' +
      '<div id="ok-sum" style="display:none;margin:10px 0;padding:8px;background:#eef2ff;border-radius:8px;font-size:12px"></div>' +
      '<div id="ok-listwrap" style="display:none;margin:10px 0">' +
        '<div id="ok-agef" style="display:none;flex-wrap:wrap;gap:4px 10px;margin-bottom:8px;padding:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:12px"></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<label><input type="checkbox" id="ok-all" checked> 全選択</label><span id="ok-selc" style="font-size:12px;color:#6b7280"></span></div>' +
        '<input id="ok-search" placeholder="名前で検索" style="width:100%;box-sizing:border-box;padding:6px;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:6px">' +
        '<div id="ok-list" style="max-height:38vh;overflow:auto;border:1px solid #e5e7eb;border-radius:8px"></div>' +
      '</div>' +
      '<button id="ok-send" style="display:none;width:100%;padding:12px;font-weight:700;color:#fff;background:#e84575;border:0;border-radius:8px">送信開始</button>' +
      '<div id="ok-prog" style="display:none;margin:10px 0">' +
        '<div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden"><div id="ok-bar" style="height:8px;width:0;background:#10b981"></div></div>' +
        '<div style="font-size:12px;margin-top:4px"><span id="ok-pc">0</span>/<span id="ok-pt">0</span> <span id="ok-pn"></span></div>' +
        '<div style="margin-top:6px"><button id="ok-pause" style="padding:6px 12px;border:1px solid #e5e7eb;background:#fff;border-radius:6px;margin-right:6px">一時停止</button>' +
        '<button id="ok-stop" style="padding:6px 12px;border:0;background:#ef4444;color:#fff;border-radius:6px">中止</button></div>' +
      '</div>' +
      '<div id="ok-res" style="display:none;margin-top:10px;padding:10px;background:#f0fdf4;border:1px solid #10b981;border-radius:8px;font-size:12px"></div>' +
      '<div style="margin-top:12px"><button id="ok-loghist" type="button" style="width:100%;padding:9px;border:1px solid #e5e7eb;background:#fff;border-radius:8px;font-size:12px">送信履歴を見る</button></div>' +
      '<div id="ok-loglist" style="display:none;margin-top:8px;border:1px solid #e5e7eb;border-radius:8px;max-height:42vh;overflow:auto"></div>' +
      '<div style="margin-top:12px;border-top:1px solid #eee;padding-top:8px;font-size:11px;color:#9ca3af">' +
        '送信済み記録: <span id="ok-sentn">0</span>件 ' +
        '<button id="ok-clear" style="border:0;background:#fee2e2;color:#b91c1c;border-radius:6px;padding:3px 8px;margin-left:6px">全データ削除</button></div>' +
    '</div>';
  document.body.appendChild(panel);

  function $(id) { return document.getElementById(id); }
  $('ok-gid').textContent = gid ? ('GID: ' + gid) : 'GIDが取得できません（オキニトーク関連ページで開いてください）';
  if (!gid) $('ok-fetch').disabled = true;
  function refreshSentN() { $('ok-sentn').textContent = Object.keys(getSent()).length; }
  refreshSentN();

  $('ok-x').onclick = function () { panel.remove(); ifr.remove(); window.__okiniTool = false; };
  $('ok-min').onclick = function () {
    var b = $('ok-body'); b.style.display = b.style.display === 'none' ? 'block' : 'none';
  };
  $('ok-msg').addEventListener('input', function (e) { $('ok-cc').textContent = e.target.value.length; });
  function applyVars(t, u) { return String(t).replace(/\{名前\}/g, (u && u.name) || ''); }
  $('ok-var-name').onclick = function () {
    var ta = $('ok-msg');
    var s = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
    var e = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
    var tok = '{名前}';
    ta.value = ta.value.slice(0, s) + tok + ta.value.slice(e);
    var pos = s + tok.length;
    try { ta.setSelectionRange(pos, pos); } catch (err) {}
    ta.focus();
    $('ok-cc').textContent = ta.value.length;
  };
  $('ok-clear').onclick = function () {
    if (!confirm('送信済み・スキップ・ログを全て削除します。\n（テンプレートは残ります）よろしいですか？')) return;
    localStorage.removeItem(K_SENT); localStorage.removeItem(K_SKIP); localStorage.removeItem(K_LOGS);
    refreshSentN(); renderLogs(); alert('削除しました');
  };

  /* ---------- テンプレート ---------- */
  function renderTplOptions() {
    var tpls = getTpls();
    $('ok-tpl').innerHTML = '<option value="">-- テンプレートを選択 --</option>' +
      tpls.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'; }).join('');
  }
  $('ok-tpl').addEventListener('change', function () {
    var id = this.value; if (!id) return;
    var t = getTpls().filter(function (x) { return x.id === id; })[0];
    if (t) { $('ok-msg').value = t.body; $('ok-cc').textContent = t.body.length; }
  });
  $('ok-tpl-save').onclick = function () {
    var body = $('ok-msg').value.trim();
    if (!body) { alert('メッセージを入力してから保存してください'); return; }
    var name = prompt('テンプレート名を入力してください（例：出勤告知）');
    if (name == null) return;
    name = name.trim(); if (!name) return;
    var tpls = getTpls();
    tpls.push({ id: String(Date.now()), name: name, body: body });
    setTpls(tpls); renderTplOptions();
    var sel = $('ok-tpl'); sel.value = tpls[tpls.length - 1].id;
    alert('「' + name + '」を保存しました');
  };
  $('ok-tpl-del').onclick = function () {
    var id = $('ok-tpl').value;
    if (!id) { alert('削除するテンプレートを選択してください'); return; }
    var t = getTpls().filter(function (x) { return x.id === id; })[0];
    if (!t || !confirm('テンプレート「' + t.name + '」を削除しますか？')) return;
    setTpls(getTpls().filter(function (x) { return x.id !== id; }));
    renderTplOptions();
  };
  renderTplOptions();

  /* ---------- カスタム取得人数 ---------- */
  $('ok-limit').addEventListener('change', function () {
    $('ok-limit-cw').style.display = this.value === 'custom' ? 'block' : 'none';
  });

  /* ---------- 送信履歴 ---------- */
  function renderLogs() {
    var box = $('ok-loglist');
    if (!box) return;
    var logs = lsGet(K_LOGS, []);
    if (!logs.length) { box.innerHTML = '<div style="padding:10px;color:#9ca3af;font-size:12px">送信履歴はまだありません</div>'; return; }
    box.innerHTML = logs.map(function (l, idx) {
      var dt = new Date(l.timestamp).toLocaleString('ja-JP');
      var head = '成功' + (l.successCount || 0) + ' / 不明' + (l.unknownCount || 0) + ' / ブロック' + (l.blockedCount || 0) + ' / 失敗' + (l.failCount || 0);
      var det = (l.details || []).map(function (d) {
        var lbl = d.status === 'success' ? '✓送信' : d.status === 'blocked' ? '⊘ブロック' : d.status === 'unknown' ? '?不明' : '✗失敗';
        return '<div style="display:flex;justify-content:space-between;gap:6px;padding:3px 8px;font-size:11px;border-top:1px solid #f3f4f6">' +
          '<span style="flex:1">' + esc(d.name) + '</span><span>' + lbl + '</span><span style="color:#9ca3af">' + esc(d.time || '') + '</span></div>';
      }).join('');
      return '<div style="border-bottom:1px solid #e5e7eb">' +
        '<div class="ok-logitem" data-i="' + idx + '" style="padding:8px;font-size:12px">' +
          '<div style="color:#6b7280">' + esc(dt) + '</div>' +
          '<div>' + head + ' <span style="color:#6c5ce7">▼詳細</span></div>' +
          '<div style="color:#9ca3af;font-size:11px">「' + esc(l.message || '') + '」</div>' +
        '</div>' +
        '<div class="ok-logdet" data-i="' + idx + '" style="display:none">' + det + '</div></div>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.ok-logitem'), function (it) {
      it.addEventListener('click', function () {
        var det = box.querySelector('.ok-logdet[data-i="' + it.dataset.i + '"]');
        if (det) det.style.display = det.style.display === 'none' ? 'block' : 'none';
      });
    });
  }
  $('ok-loghist').onclick = function () {
    var b = $('ok-loglist');
    if (b.style.display === 'none') { renderLogs(); b.style.display = 'block'; $('ok-loghist').textContent = '送信履歴を閉じる'; }
    else { b.style.display = 'none'; $('ok-loghist').textContent = '送信履歴を見る'; }
  };

  /* ---------- 一覧取得 ---------- */
  var allTargets = [];
  var unchecked = {};
  var ageSel = {};
  var sendState = { running: false, paused: false };

  function ageKey(u) { return (u.ageRange && u.ageRange.trim()) ? u.ageRange.trim() : '未設定'; }
  function passesAge(u) { return ageSel[ageKey(u)] !== false; }
  function buildAgeFilter() {
    var keys = [], seen = {};
    allTargets.forEach(function (u) { var k = ageKey(u); if (!seen[k]) { seen[k] = 1; keys.push(k); } });
    keys.sort(function (a, b) {
      if (a === '未設定') return 1; if (b === '未設定') return -1;
      var na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b, 'ja');
    });
    ageSel = {};
    keys.forEach(function (k) { ageSel[k] = true; });
    var box = $('ok-agef');
    if (keys.length <= 1) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'flex';
    box.innerHTML = '<span style="width:100%;color:#6b7280">年代でしぼる（チェックを外すと除外）</span>' +
      keys.map(function (k) {
        return '<label style="display:inline-flex;gap:3px;align-items:center"><input type="checkbox" class="ok-agecb" data-k="' + esc(k) + '" checked> ' + esc(k) + '</label>';
      }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.ok-agecb'), function (cb) {
      cb.addEventListener('change', function () { ageSel[cb.dataset.k] = cb.checked; renderList(); });
    });
  }

  function getOpts() {
    var lv = $('ok-limit').value, limit;
    if (lv === 'custom') limit = parseInt($('ok-limit-cv').value, 10) || 0;
    else limit = parseInt(lv, 10) || 0;
    return {
      mode: $('ok-mode').value,
      limit: limit,
      rep: $('ok-rep').checked, repn: parseInt($('ok-repn').value, 10) || 1,
      rec: $('ok-rec').checked, recd: parseInt($('ok-recd').value, 10) || 3
    };
  }

  function parseUsers(doc) {
    var lis = doc.querySelectorAll('ul.talk_box > li.list[data-memberid]');
    if (!lis.length) lis = doc.querySelectorAll('li.list[data-memberid]');
    var out = [];
    for (var i = 0; i < lis.length; i++) {
      var li = lis[i];
      var ageEl = li.querySelector('.age');
      var ageText = ageEl ? ageEl.textContent.trim() : '';
      var rm = ageText.match(/予約回数(\d+)回/);
      var ar = ageText.match(/\((\d+代)\)/);
      var nameEl = li.querySelector('.name');
      var dayEl = li.querySelector('.talk_day');
      var pin = li.getAttribute('data-pinflg');
      out.push({
        memberId: li.getAttribute('data-memberid'),
        name: nameEl ? nameEl.textContent.trim() : '',
        ageRange: ar ? ar[1] : '',
        reserveCount: rm ? parseInt(rm[1], 10) : 0,
        isPinned: pin != null && pin !== '0' && pin !== '',
        hasUnread: li.classList.contains('unread') || !!li.querySelector('.unread'),
        lastTalkDate: dayEl ? dayEl.textContent.trim() : ''
      });
    }
    return out;
  }

  function readTotal(doc) {
    var c = doc.querySelector('.counter');
    if (c) { var m = c.textContent.replace(/,/g, '').match(/全[^\d]*(\d+)/); if (m) return parseInt(m[1], 10); }
    return null;
  }

  function filterPage(users, opts, sent, skip, now, acc) {
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (opts.mode === 'pin-only' && !u.isPinned) continue;
      if (opts.mode === 'pin-exclude' && u.isPinned) continue;
      if (u.hasUnread) { acc.su++; continue; }
      if (opts.rep && u.reserveCount >= opts.repn) { acc.sr++; continue; }
      if (opts.rec && u.lastTalkDate) {
        var dt = parseJaDate(u.lastTalkDate);
        if (dt && (now - dt) / 86400000 <= opts.recd) { acc.srec++; continue; }
      }
      if (sent[u.memberId]) { acc.ss++; continue; }
      if (skip[u.memberId]) { acc.sk++; continue; }
      acc.targets.push(u);
    }
  }

  $('ok-fetch').onclick = async function () {
    if (!gid) return;
    var btn = $('ok-fetch');
    btn.disabled = true;
    try {
      if ($('ok-fresh').checked) {
        localStorage.removeItem(K_SENT); localStorage.removeItem(K_SKIP); refreshSentN();
      }
      var opts = getOpts();
      var sent = getSent(), skip = getSkipped(), now = new Date();
      var acc = { targets: [], su: 0, sr: 0, srec: 0, ss: 0, sk: 0 };
      var base = ORIGIN + '/J2OkiniTalkUserList.php?gid=' + gid;

      btn.textContent = '取得中... 1ページ目';
      var r1 = await loadAndPoll(ifr, base, '.counter, li.list[data-memberid]', 40);
      if (!r1.doc) { alert('一覧ページの読み込みに失敗しました'); return; }
      var total = readTotal(r1.doc);
      var totalPages = total ? Math.ceil(total / 30) : 1;
      filterPage(parseUsers(r1.doc), opts, sent, skip, now, acc);

      var page = 1;
      while (page < totalPages) {
        if (opts.limit > 0 && acc.targets.length >= opts.limit) break;
        await rnd(2500, 5000);
        page++;
        btn.textContent = '取得中... ' + page + '/' + totalPages + 'ページ（' + acc.targets.length + '人）';
        var url = base + '&current_page=' + (page - 1) + '&pager=1&search=';
        var rn = await loadAndPoll(ifr, url, '.counter, li.list[data-memberid]', 40);
        await rnd(1200, 2200);
        if (rn.doc) filterPage(parseUsers(rn.doc), opts, sent, skip, now, acc);
      }

      allTargets = (opts.limit > 0) ? acc.targets.slice(0, opts.limit) : acc.targets;
      unchecked = {};
      buildAgeFilter();

      $('ok-sum').style.display = 'block';
      $('ok-sum').innerHTML = '送信対象 <b>' + allTargets.length + '</b>人　/　除外: ' +
        acc.su + '(未読) ' + acc.sr + '(リピーター) ' + acc.srec + '(最近) ' + acc.ss + '(送信済み) ' + acc.sk + '(スキップ)';
      renderList();
      $('ok-listwrap').style.display = 'block';
      $('ok-send').style.display = 'block';
      $('ok-send').disabled = allTargets.length === 0;
    } catch (e) {
      alert('取得エラー: ' + (e && e.message));
    } finally {
      btn.disabled = false; btn.textContent = '対象者を取得';
    }
  };

  /* ---------- 対象者一覧 ---------- */
  function visible() {
    var q = ($('ok-search').value || '').toLowerCase();
    return allTargets.filter(function (u) {
      return (!q || (u.name || '').toLowerCase().indexOf(q) !== -1) && passesAge(u);
    });
  }
  function selectedTargets() {
    return allTargets.filter(function (u) { return !unchecked[u.memberId] && passesAge(u); });
  }

  function renderList() {
    var vis = visible();
    $('ok-list').innerHTML = vis.map(function (u) {
      return '<label style="display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px">' +
        '<input type="checkbox" class="ok-cb" data-id="' + esc(u.memberId) + '"' + (unchecked[u.memberId] ? '' : ' checked') + '>' +
        '<span style="flex:1">' + esc(u.name) + '</span>' +
        '<span style="color:#6b7280">' + esc(u.ageRange || '') + '</span>' +
        '<span>' + (u.isPinned ? '📌' : '') + '</span>' +
        '<span style="color:#6b7280">' + (u.reserveCount > 0 ? u.reserveCount + '回' : '') + '</span>' +
        '<span style="color:#9ca3af">' + esc(u.lastTalkDate || '') + '</span></label>';
    }).join('');
    Array.prototype.forEach.call($('ok-list').querySelectorAll('.ok-cb'), function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked) delete unchecked[cb.dataset.id]; else unchecked[cb.dataset.id] = 1;
        updSel();
      });
    });
    updSel();
  }
  function updSel() {
    var n = selectedTargets().length;
    $('ok-selc').textContent = n + '人選択中（全' + allTargets.length + '）';
    $('ok-send').disabled = n === 0 || sendState.running;
  }
  $('ok-search').addEventListener('input', renderList);
  $('ok-all').addEventListener('change', function (e) {
    visible().forEach(function (u) { if (e.target.checked) delete unchecked[u.memberId]; else unchecked[u.memberId] = 1; });
    renderList();
  });

  /* ---------- 送信 ---------- */
  $('ok-pause').onclick = function () {
    sendState.paused = !sendState.paused;
    $('ok-pause').textContent = sendState.paused ? '再開' : '一時停止';
  };
  $('ok-stop').onclick = function () { if (confirm('送信を中止しますか？')) sendState.running = false; };

  async function sendOne(u, msg) {
    var url = ORIGIN + '/okinitalk/talk?mid=' + encodeURIComponent(u.memberId) + '&gid=' + gid;
    var r = await loadAndPoll(ifr, url, 'textarea#te_box, div.talk_block.tbactive, div.talk_editor.deactive', 48);
    var d = r.doc, w = r.win;
    if (!d) return 'fail';
    if (d.querySelector('div.talk_block.tbactive')) return 'blocked';
    var ta = d.querySelector('textarea#te_box');
    if (!ta) return 'fail';
    try {
      ta.focus();
      ta.value = msg;
      var EV = (w && w.Event) || Event, KE = (w && w.KeyboardEvent) || KeyboardEvent;
      ['focus', 'input', 'change'].forEach(function (t) { ta.dispatchEvent(new EV(t, { bubbles: true })); });
      ['keydown', 'keypress', 'keyup'].forEach(function (t) { ta.dispatchEvent(new KE(t, { key: 'a', bubbles: true })); });
      if (w && w.$) { try { w.$(ta).trigger('input').trigger('change').trigger('keyup'); } catch (e) {} }
    } catch (e) { return 'fail'; }
    await rnd(1400, 1800);
    var d2; try { d2 = ifr.contentDocument; } catch (e) {}
    var btn = d2 && d2.querySelector('input.te_submit');
    if (!btn) return 'fail';
    try {
      if (btn.style.display === 'none') btn.style.display = '';
      btn.click();
      if (w && w.$) { try { w.$(btn).trigger('click'); } catch (e) {} }
    } catch (e) { return 'fail'; }
    /* 成否確認 */
    for (var c = 0; c < 12; c++) {
      await rnd(450, 550);
      var d3; try { d3 = ifr.contentDocument; } catch (e) {}
      if (!d3) continue;
      var ta3 = d3.querySelector('textarea#te_box');
      var bt = ''; try { bt = d3.body ? d3.body.innerText : ''; } catch (e) {}
      if ((ta3 && ta3.value.trim() === '') || bt.indexOf(msg) !== -1) return 'success';
    }
    return 'unknown';
  }

  $('ok-send').onclick = async function () {
    var template = $('ok-msg').value.trim();
    if (!template) { alert('メッセージを入力してください'); return; }
    var targets = selectedTargets();
    if (!targets.length) return;
    var ex = targets[0] ? (targets[0].name || 'お客様') : 'お客様';
    var preview = applyVars(template, targets[0] || {});
    if (!confirm(targets.length + '人に送信します。\n\n【' + ex + ' さんへの送信例】\n' + preview + '\n\nよろしいですか？\n（途中で止めても、もう一度実行すれば続きから送れます）')) return;

    var excluded = allTargets.filter(function (u) { return unchecked[u.memberId]; }).map(function (u) { return u.memberId; });
    if (excluded.length) setSkipped(excluded);

    sendState = { running: true, paused: false };
    $('ok-send').style.display = 'none';
    $('ok-fetch').disabled = true;
    $('ok-prog').style.display = 'block';
    $('ok-pt').textContent = targets.length;

    var ok = 0, blocked = 0, fail = 0, unknown = 0, details = [];
    for (var i = 0; i < targets.length; i++) {
      while (sendState.paused) await rnd(400, 600);
      if (!sendState.running) break;
      var u = targets[i];
      $('ok-pc').textContent = i + 1;
      $('ok-bar').style.width = ((i + 1) / targets.length * 100) + '%';
      $('ok-pn').textContent = '送信中: ' + u.name;
      var st = 'fail';
      try { st = await sendOne(u, applyVars(template, u)); } catch (e) { st = 'fail'; }
      if (st === 'success' || st === 'unknown') { markSent(u.memberId); refreshSentN(); }
      if (st === 'success') ok++;
      else if (st === 'blocked') blocked++;
      else if (st === 'unknown') { unknown++; }
      else fail++;
      details.push({ name: u.name, memberId: u.memberId, status: st, time: new Date().toLocaleTimeString('ja-JP') });
      if (i < targets.length - 1 && sendState.running) {
        if (Math.random() < 0.1) await rnd(3000, 5000); else await rnd(1000, 3000);
      }
    }

    sendState.running = false;
    $('ok-prog').style.display = 'none';
    $('ok-fetch').disabled = false;
    $('ok-res').style.display = 'block';
    $('ok-res').innerHTML = '送信成功 <b>' + ok + '</b> / 受信扱い不明 ' + unknown +
      ' / ブロック ' + blocked + ' / 失敗 ' + fail + ' / 手動除外 ' + excluded.length +
      '<br><span style="color:#6b7280">「不明」も送信済みとして記録（重複防止）。相手側で念のため確認推奨。</span>';
    addLog({
      timestamp: new Date().toISOString(), successCount: ok, unknownCount: unknown,
      blockedCount: blocked, failCount: fail, manualExclude: excluded.length,
      total: targets.length, message: template.slice(0, 50) + (template.length > 50 ? '...' : ''), details: details
    });
    if ($('ok-loglist').style.display !== 'none') renderLogs();
  };
})();
