import { useEffect, useRef, useState } from "react";
import { Check, Moon, Sun } from "@phosphor-icons/react";
import { ACCENTS, readAccent, readDarkMode, saveAccent, saveDarkMode, type AccentId } from "../lib/accent";

export default function AccentPicker() {
  const [accent, setAccent] = useState<AccentId>(readAccent);
  const [dark, setDark] = useState(readDarkMode);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  function choose(id: AccentId) {
    setAccent(id);
    saveAccent(id);
  }

  function toggleDark() {
    setDark(!dark);
    saveDarkMode(!dark);
  }

  return (
    <div className="accent-picker" ref={root}>
      <button className="accent-toggle" aria-label="Accent color" aria-expanded={open} aria-controls="accent-menu" onClick={() => setOpen(!open)}><span aria-hidden="true" /></button>
      {open && <div className="accent-menu" id="accent-menu">
        <p id="accent-menu-title">Accent color</p>
        <div className="accent-swatches" role="radiogroup" aria-labelledby="accent-menu-title">
          {ACCENTS.map(option => <button key={option.id} role="radio" aria-checked={accent === option.id} aria-label={option.label} title={option.label} style={{ background: option.swatch }} onClick={() => choose(option.id)}>{accent === option.id && <Check size={18} weight="bold" aria-hidden="true" />}</button>)}
        </div>
        <button className="theme-switch" role="switch" aria-checked={dark} onClick={toggleDark}>{dark ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}Dark mode<span aria-hidden="true" /></button>
      </div>}
    </div>
  );
}
