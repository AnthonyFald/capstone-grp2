const chapters = [...document.querySelectorAll('.transcript-chapter')];
const toggle = document.querySelector('#toggle-transcript');
function updateLabel() {
  toggle.textContent = chapters.every(chapter => chapter.open) ? 'Collapse all topics' : 'Expand all topics';
  toggle.setAttribute('aria-expanded', String(chapters.every(chapter => chapter.open)));
}
toggle.hidden = false;
toggle.setAttribute('aria-controls', 'transcript-body');
toggle.addEventListener('click', () => {
  const open = !chapters.every(chapter => chapter.open);
  chapters.forEach(chapter => { chapter.open = open; });
  updateLabel();
});
chapters.forEach(chapter => chapter.addEventListener('toggle', updateLabel));
function revealLinkedTopic() {
  const topic = chapters.find(chapter => '#' + chapter.id === window.location.hash);
  if (topic) topic.open = true;
}
window.addEventListener('hashchange', revealLinkedTopic);
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', () => {
    const topic = chapters.find(chapter => '#' + chapter.id === link.hash);
    if (topic) topic.open = true;
  });
});
revealLinkedTopic();
updateLabel();
