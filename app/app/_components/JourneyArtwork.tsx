"use client";

import { ArrowUpRight, FileText, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { Logo } from "./ui";

/** Decorative illustration of the workflow; it does not represent application data. */
export function JourneyArtwork() {
  const art = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = art.current;
    if (!element) return;
    let visible = false;
    const update = () => { element.dataset.paused = String(!visible || document.hidden); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  return (
    <div ref={art} className="journey-art" aria-hidden="true">
      <div className="journey-orbit journey-orbit-one" />
      <div className="journey-orbit journey-orbit-two" />
      <div className="journey-emblem"><Logo /></div>
      <div className="journey-chip journey-chip-search"><span><Search size={16} /></span><div><small>01 / DISCOVER</small><strong>发现新的可能</strong></div></div>
      <div className="journey-chip journey-chip-resume"><span><FileText size={16} /></span><div><small>02 / PREPARE</small><strong>让优势被看见</strong></div></div>
      <div className="journey-launch"><ArrowUpRight size={18} /><span>开启下一程</span></div>
      <i className="journey-dot journey-dot-one" /><i className="journey-dot journey-dot-two" />
    </div>
  );
}
