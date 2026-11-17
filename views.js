// One page, two views: Games (./) and Tools & More (./#tools).
// Old links keep working: index.html is dropped from the address bar, tools.html redirects here.

const VIEWS = {
    games: { el: document.getElementById('view-games'), title: 'Archipelago Games Library' },
    tools: { el: document.getElementById('view-tools'), title: 'Archipelago Tools, Meta & Hint Games' },
};
const navLinks = document.querySelectorAll('[data-view]');

// /Archipelago-Games-Library/index.html → /Archipelago-Games-Library/
if (/\/index\.html$/.test(location.pathname)) {
    history.replaceState(history.state, '', location.pathname.replace(/index\.html$/, '') + location.search + location.hash);
}

const viewFromHash = () => (location.hash === '#tools' ? 'tools' : 'games');

function show(name) {
    for (const [key, v] of Object.entries(VIEWS)) v.el.hidden = key !== name;
    navLinks.forEach((a) => a.classList.contains('nav-link') && a.classList.toggle('active', a.dataset.view === name));
    document.title = VIEWS[name].title;
}

navLinks.forEach((a) => a.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;   // new tab etc.: let the browser handle it
    e.preventDefault();
    const name = a.dataset.view;
    const url = location.pathname + location.search + (name === 'tools' ? '#tools' : '');
    if (viewFromHash() !== name) history.pushState(null, '', url);
    show(name);
    window.scrollTo({ top: 0 });
}));

window.addEventListener('popstate', () => show(viewFromHash()));
window.addEventListener('hashchange', () => show(viewFromHash()));
show(viewFromHash());
