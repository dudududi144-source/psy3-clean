

/* ══════════════════════════════════════════════════════════
   PERFORMANCE UTILITIES (v2.0)
   ══════════════════════════════════════════════════════════ */

// Debounce utility
function debounce(fn, delay) {
  var timer = null;
  return function() {
    var ctx = this, args = arguments;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function() {
      fn.apply(ctx, args);
      timer = null;
    }, delay);
  };
}

// Throttle utility
function throttle(fn, limit) {
  var lastCall = 0;
  return function() {
    var now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      fn.apply(this, arguments);
    }
  };
}