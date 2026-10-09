const demos = [...document.querySelectorAll('.demo')];
const expandButton = document.querySelector('.expand-all');
function updateExpandButton() {
  expandButton.textContent = demos.every(demo => demo.open) ? 'Collapse all' : 'Expand all';
}
expandButton.addEventListener('click', () => {
  const shouldOpen = !demos.every(demo => demo.open);
  demos.forEach(demo => { demo.open = shouldOpen; });
  updateExpandButton();
});
demos.forEach(demo => demo.addEventListener('toggle', updateExpandButton));
const sections = [...document.querySelectorAll('main > section')];
const navigationLinks = [...document.querySelectorAll('nav a')];
let scheduled = false;
function updateNavigation() {
  const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5;
  let active = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= 160) active = section;
  }
  if (nearBottom) active = sections[sections.length - 1];
  for (const link of navigationLinks) {
    if (link.hash === '#' + active.id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  scheduled = false;
}
window.addEventListener('scroll', () => {
  if (!scheduled) { scheduled = true; window.requestAnimationFrame(updateNavigation); }
}, { passive: true });
window.addEventListener('resize', updateNavigation);
window.addEventListener('load', updateNavigation);
