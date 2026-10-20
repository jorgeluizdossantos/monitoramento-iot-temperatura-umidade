import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
export function initializeTheme() {
  try { document.documentElement.dataset.theme = localStorage.getItem('stma-theme') === 'dark' ? 'dark' : 'light'; }
  catch { document.documentElement.dataset.theme = 'light'; }
}
export function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  return <button className="theme-toggle" type="button" aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'} aria-pressed={dark} onClick={() => {
    const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem('stma-theme', next ? 'dark' : 'light'); } catch { /* Preferência permanece nesta aba. */ }
  }}>{dark ? <Sun size={18} aria-hidden="true"/> : <Moon size={18} aria-hidden="true"/>}<span>{dark ? 'Tema claro' : 'Tema escuro'}</span></button>;
}
