// More → Appearance, applied before the first paint so the app never flashes the other look. Mirrors
// src/lib/appearance.ts (kept tiny and plain: it runs before the app's own code). A preference of this phone only.
;(function () {
  try {
    var choice = localStorage.getItem('life-design:appearance')
    if (choice !== 'light' && choice !== 'dark') return
    document.documentElement.setAttribute('data-appearance', choice)
    var colour = choice === 'dark' ? '#151514' : '#f6f4ef'
    var metas = document.querySelectorAll('meta[name="theme-color"]')
    for (var i = 0; i < metas.length; i += 1) metas[i].setAttribute('content', colour)
  } catch (e) {
    // Storage refused: the iPhone's own setting applies.
  }
})()
