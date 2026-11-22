"use client";

import { ChevronDown, Palette, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { attachAmbientSurface } from "./ambient-surface";

const KEY = "nextrole-appearance";
const CHANGE = "nextrole-appearance-change";
const STYLES = [
  { id: "mint", name: "薄荷轻柔", description: "圆润、柔软，带一点手写温度" },
  { id: "lilac", name: "雾紫云朵", description: "轻盈的紫调，放松一点点" },
  { id: "clear", name: "清透留白", description: "更克制的光影，清爽的字形" },
] as const;
type Preferences = { style: typeof STYLES[number]["id"]; motion: boolean };
const DEFAULT: Preferences = { style: "mint", motion: true };
let memory = JSON.stringify(DEFAULT);
function read() {
  try { return window.localStorage.getItem(KEY) ?? memory; } catch { return memory; }
}
function parse(raw: string): Preferences {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return DEFAULT;
    const { style, motion } = value as Partial<Preferences>;
    return { style: STYLES.some(item => item.id === style) ? style! : DEFAULT.style, motion: typeof motion === "boolean" ? motion : DEFAULT.motion };
  } catch { return DEFAULT; }
}
function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) {
      memory = event.newValue ?? JSON.stringify(DEFAULT);
      notify();
    }
  };
  window.addEventListener(CHANGE, notify);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(CHANGE, notify); window.removeEventListener("storage", storage); };
}
function useAppearance() {
  const raw = useSyncExternalStore(subscribe, read, () => JSON.stringify(DEFAULT));
  const preferences = useMemo(() => parse(raw), [raw]);
  const update = (patch: Partial<Preferences>) => {
    memory = JSON.stringify({ ...parse(read()), ...patch });
    try { window.localStorage.setItem(KEY, memory); } catch { /* Still works for this session when storage is unavailable. */ }
    window.dispatchEvent(new Event(CHANGE));
  };
  return { preferences, update };
}

export function Appearance() {
  const { preferences } = useAppearance();
  const surface = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    document.documentElement.dataset.style = preferences.style;
    document.documentElement.dataset.motion = preferences.motion ? "on" : "off";
  }, [preferences]);

  useEffect(() => {
    if (surface.current) return attachAmbientSurface(surface.current, preferences.motion);
  }, [preferences.motion, preferences.style]);

  return <div className="soft-backdrop" aria-hidden="true">
    <div className="ambient-form ambient-form-one" /><div className="ambient-form ambient-form-two" /><div className="ambient-form ambient-form-three" />
    <canvas ref={surface} className="ambient-surface" />
  </div>;
}

export function AppearanceMenu() {
  const { preferences, update } = useAppearance();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target)) menu.current?.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.removeAttribute("open"); menu.current.querySelector("summary")?.focus();
      }
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, []);
  return <details className="appearance-menu" ref={menu}>
    <summary aria-label="外观设置"><Palette size={17} aria-hidden /><span>外观</span><ChevronDown size={13} aria-hidden /></summary>
    <div className="appearance-popover">
      <p className="appearance-title">换一种心情，继续向前。</p>
      <p className="appearance-hint">选一个喜欢的样子，会自动记住。</p>
      <fieldset>
        <legend className="sr-only">界面风格</legend>
        {STYLES.map(style => <label key={style.id} className="style-option" data-selected={preferences.style === style.id}>
          <input type="radio" name="nextrole-style" value={style.id} checked={preferences.style === style.id} onChange={() => update({ style: style.id })} />
          <span className={`style-swatch style-swatch-${style.id}`} aria-hidden><i /><i /><i /></span>
          <span className="style-option-copy"><strong>{style.name}</strong><small>{style.description}</small></span>
          {preferences.style === style.id && <Check size={15} className="text-accent" aria-hidden />}
        </label>)}
      </fieldset>
      <label className="motion-option"><span><strong>柔态动效</strong><small>顶部轻浮动，划过底色泛起柔软褶动</small></span><input type="checkbox" role="switch" aria-label="柔态动效" checked={preferences.motion} onChange={event => update({ motion: event.target.checked })} /></label>
      <p className="appearance-hint">触屏和系统“减少动态效果”模式下自动静止。</p>
    </div>
  </details>;
}
