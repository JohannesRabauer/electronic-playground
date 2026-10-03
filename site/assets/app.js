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

  document.querySelectorAll('[data-print]').forEach(function (btn) {
    btn.addEventListener('click', function () { window.print(); });
  });
})();
