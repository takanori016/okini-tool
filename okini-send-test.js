(function () {
  if (window.__okiniSendTest) { alert('既に起動しています'); return; }
  window.__okiniSendTest = true;

  var ORIGIN = 'https://spgirl.cityheaven.net';
  var box, log;

  function ui() {
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;z-index:2147483647;background:#fff;border:2px solid #e84575;border-radius:10px;padding:10px;font:13px/1.6 -apple-system,sans-serif;color:#1a1a2e;max-height:82vh;overflow:auto;box-shadow:0 6px 24px rgba(0,0,0,.35)';
    var h = document.createElement('div');
    h.style.cssText = 'font-weight:700;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px';
    var t = document.createElement('span');
    t.textContent = 'オキニ 実送信1通テスト (A)';
    var x = document.createElement('button');
    x.textContent = '×';
    x.style.cssText = 'border:0;background:#eee;border-radius:6px;padding:2px 10px;font-size:16px';
    x.onclick = function () { box.remove(); window.__okiniSendTest = false; };
    h.appendChild(t); h.appendChild(x); box.appendChild(h);
    log = document.createElement('div'); box.appendChild(log);
    document.body.appendChild(box);
  }

  function line(txt, ok) {
    var d = document.createElement('div');
    d.style.margin = '3px 0';
    d.textContent = (ok === true ? 'OK ' : ok === false ? 'NG ' : '- ') + txt;
    log.appendChild(d); box.scrollTop = box.scrollHeight; return d;
  }

  function waitFor(doc, sel, cb) {
    var n = 0;
    var iv = setInterval(function () {
      n++;
      var f = null;
      try { f = doc.querySelector(sel); } catch (e) {}
      if (f || n >= 32) { clearInterval(iv); cb(f, n); }
    }, 500);
  }

  ui();
  line('実送信テストを開始します');

  var cspHit = false;
  document.addEventListener('securitypolicyviolation', function (e) {
    cspHit = true; line('CSP違反: ' + e.violatedDirective, false);
  });

  function findGid() {
    var m = location.href.match(/[?&]gid=(\d+)/); if (m) return m[1];
    var el = document.querySelector('#gid, input[name="gid"]'); if (el && el.value) return el.value;
    var a = document.querySelector('a[href*="gid="]'); if (a) { var mm = a.href.match(/gid=(\d+)/); if (mm) return mm[1]; }
    var f = document.querySelector('form[action*="gid="]'); if (f) { var fm = f.action.match(/gid=(\d+)/); if (fm) return fm[1]; }
    return null;
  }

  var gid = findGid();
  if (!gid) { line('GIDが取得できません。オキニトーク関連ページで実行してください', false); return; }
  line('GID取得: ' + gid, true);

  var mid = prompt('【実送信テスト】送信先の memberId（mid）を入力してください。\nここで入力した相手に実際にメッセージを1通送ります。\n必ず自分の別アカウント等、安全な相手にしてください。');
  if (!mid) { line('midが未入力のため中止しました（送信していません）'); return; }
  mid = mid.trim();

  var defaultMsg = 'テスト送信です。確認用のため返信不要です。';
  var msg = prompt('送信するメッセージを入力してください（空欄ならテスト文を使用）', defaultMsg);
  if (msg === null) { line('キャンセルされました（送信していません）'); return; }
  msg = (msg.trim() || defaultMsg);

  if (!confirm('本当に送信します。\n\n送信先mid: ' + mid + '\n本文: ' + msg + '\n\nこの相手に実際に1通送信してよろしいですか？')) {
    line('確認でキャンセルされました（送信していません）');
    return;
  }

  line('送信先 mid=' + mid);
  line('トーク画面を読み込み中...');

  var ifr = document.createElement('iframe');
  ifr.style.cssText = 'width:1px;height:1px;opacity:0;position:absolute;left:-9999px';
  var url = ORIGIN + '/okinitalk/talk?mid=' + encodeURIComponent(mid) + '&gid=' + gid;
  var handled = false;

  ifr.onload = function () {
    if (handled) return;
    handled = true;
    line('読み込み完了。入力欄の出現を待機中...');
    var d, w;
    try { d = ifr.contentDocument; w = ifr.contentWindow; } catch (e) {}
    if (!d) { line('iframeのDOMにアクセス不可', false); return; }

    waitFor(d, 'textarea#te_box', function (ta) {
      if (!ta) { line('入力欄 textarea#te_box が出現しませんでした', false); return; }
      line('入力欄を確認', true);

      var blk = d.querySelector('div.talk_block.tbactive');
      if (blk) { line('この相手はブロック中のため送信を中止しました', false); return; }
      line('ブロックなし', true);

      try {
        ta.focus();
        ta.value = msg;
        var EV = w.Event || Event;
        var KE = w.KeyboardEvent || KeyboardEvent;
        ['focus', 'input', 'change'].forEach(function (t) {
          ta.dispatchEvent(new EV(t, { bubbles: true }));
        });
        ['keydown', 'keypress', 'keyup'].forEach(function (t) {
          ta.dispatchEvent(new KE(t, { key: 'a', bubbles: true }));
        });
        if (w.$) { try { w.$(ta).trigger('input').trigger('change').trigger('keyup'); } catch (e) {} }
        line('本文を入力しイベント発火', true);
      } catch (e) {
        line('入力処理で例外: ' + e.name, false);
        return;
      }

      line('1.5秒後に送信ボタンを押します...');
      setTimeout(function () {
        var btn = d.querySelector('input.te_submit');
        if (!btn) { line('送信ボタン input.te_submit が見つかりません', false); return; }
        try {
          if (btn.style.display === 'none') btn.style.display = '';
          btn.click();
          if (w.$) { try { w.$(btn).trigger('click'); } catch (e) {} }
          line('送信ボタンをクリックしました', true);
        } catch (e) {
          line('送信クリックで例外: ' + e.name, false);
          return;
        }

        setTimeout(function () {
          var d2;
          try { d2 = ifr.contentDocument; } catch (e) {}
          var sent = false, detail = '';
          if (d2) {
            var ta2 = d2.querySelector('textarea#te_box');
            var emptied = ta2 && ta2.value.trim() === '';
            var bodyTxt = '';
            try { bodyTxt = d2.body ? d2.body.innerText : ''; } catch (e) {}
            var appears = bodyTxt.indexOf(msg) !== -1;
            if (emptied) { sent = true; detail += '入力欄クリア '; }
            if (appears) { sent = true; detail += '本文が会話に出現 '; }
          }
          line('送信結果判定: ' + (sent ? '成功の可能性大 (' + detail + ')' : '不明（手動で相手側の受信を確認してください）'), sent ? true : null);
          line('—— テスト完了 ——');
          line('CSP違反: ' + (cspHit ? 'あり' : 'なし'), !cspHit);
          line('相手アカウントで実際に届いているか必ず目視確認してください');
        }, 3500);
      }, 1500);
    });
  };

  document.body.appendChild(ifr);
  ifr.src = url;
})();
