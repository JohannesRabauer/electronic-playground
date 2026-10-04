// Remembers ticked steps in this browser, and wires up the print button.
(function () {
  var PREFIX = 'ep-step:';
  function get(key) { try { return localStorage.getItem(PREFIX + key) === '1'; } catch (e) { return false; } }
  function set(key, on) { try { on ? localStorage.setItem(PREFIX + key, '1') : localStorage.removeItem(PREFIX + key); } catch (e) {} }

  document.querySelectorAll('input[type=checkbox][data-key]').forEach(function (box) {
    // The print version always starts empty, so it can be ticked with a pen.
    if (!document.body.classList.contains('print-page')) box.checked = get(box.dataset.key);
    box.addEventListener('change', function () { set(box.dataset.key, box.checked); });
  });

  // MakeCode is loaded from Microsoft only after a click (or if the visitor chose "remember").
  var EMBED_KEY = 'ep-embed-makecode';
  function remembered() { try { return localStorage.getItem(EMBED_KEY) === '1'; } catch (e) { return false; } }
  function loadEmbed(box) {
    var frame = document.createElement('iframe');
    frame.src = box.dataset.embedSrc;
    frame.title = box.dataset.embedTitle || '';
    box.classList.remove('consent');
    box.innerHTML = '';
    box.appendChild(frame);
  }
  document.querySelectorAll('[data-embed-src]').forEach(function (box) {
    if (remembered()) { loadEmbed(box); return; }
    var btn = box.querySelector('[data-load-embed]');
    if (btn) btn.addEventListener('click', function () {
      var keep = box.querySelector('[data-remember-embed]');
      if (keep && keep.checked) { try { localStorage.setItem(EMBED_KEY, '1'); } catch (e) {} }
      loadEmbed(box);
    });
  });
  document.querySelectorAll('[data-revoke-embed]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      try { localStorage.removeItem(EMBED_KEY); } catch (e) {}
      var done = document.querySelector('[data-revoke-done]');
      if (done) done.hidden = false;
    });
  });

  // Pollin carts: the form posts the articles into a new tab. Pollin answers with an empty response (the tab keeps
  // showing our waiting note) and sets its cart cookie. Only after that has arrived may the tab move on to the cart,
  // so the wait grows with the number of articles (Pollin needs about 0.1 s per article).
  document.querySelectorAll('form[data-pollin-cart]').forEach(function (form) {
    // "Order tools too": a disabled fieldset is left out of the post.
    var toggle = form.querySelector('[data-pollin-toggle]');
    var tools = form.querySelector('[data-pollin-group=tools]');
    var count = form.querySelector('[data-pollin-count]');
    function sync() {
      tools.disabled = !toggle.checked;
      count.textContent = form.querySelectorAll('fieldset:not([disabled]) input[name$="[type]"]').length;
    }
    // Browsers restore a ticked/unticked box after reload or "back", so sync once at the start too.
    if (toggle && tools) { toggle.addEventListener('change', sync); sync(); window.addEventListener('pageshow', sync); }
    form.addEventListener('submit', function () {
      var tab = window.open('', form.target);
      if (!tab) return;
      var cart = form.dataset.pollinCart;
      var items = form.querySelectorAll('fieldset:not([disabled]) input[name$="[type]"]').length;
      try {
        tab.document.title = 'Pollin';
        tab.document.body.innerHTML = '<p style="font:1.2rem sans-serif;margin:3rem;text-align:center">'
          + form.dataset.waitText + '<br><br><a href="' + cart + '">' + form.dataset.cartText + '</a></p>';
      } catch (e) {}
      setTimeout(function () { tab.location.href = cart; }, 2500 + 200 * items);
    });
  });

  document.querySelectorAll('[data-print]').forEach(function (btn) {
    btn.addEventListener('click', function () { window.print(); });
  });
})();
