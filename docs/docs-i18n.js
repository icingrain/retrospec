const langButtons = document.querySelectorAll('[data-lang-button]');
const i18nNodes = document.querySelectorAll('[data-i18n-en]');
const languageStorageKey = 'retrospec-site-language';

function applyLanguage(lang) {
  langButtons.forEach((item) => item.classList.toggle('active', item.getAttribute('data-lang-button') === lang));
  document.documentElement.lang = lang;
  i18nNodes.forEach((node) => {
    const next = node.getAttribute(`data-i18n-${lang}`);
    if (next) node.textContent = next;
  });
}

applyLanguage(localStorage.getItem(languageStorageKey) || 'en');

langButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const lang = button.getAttribute('data-lang-button') || 'en';
    localStorage.setItem(languageStorageKey, lang);
    applyLanguage(lang);
  });
});
