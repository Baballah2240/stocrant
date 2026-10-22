try {
const saved = localStorage.getItem('stocrant-theme') || localStorage.getItem('stocrant-site-theme');
const theme = saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;
const language = localStorage.getItem('stocrant.language') === 'ar' ? 'ar' : 'en';
document.documentElement.lang = language;
document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
} catch { /* Device preferences are optional. */ }
