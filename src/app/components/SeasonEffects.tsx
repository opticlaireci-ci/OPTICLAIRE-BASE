import { useEffect, useRef } from 'react';
import { useSeason } from '../contexts/SeasonContext';
import type { SeasonEffet } from '../config/seasonModes';

/**
 * SeasonEffects — animation festive PLEIN ÉCRAN pilotée par le mode actif.
 *
 *  • neige     → flocons qui tombent + décorations de Noël (🎄🎁⛄)
 *  • feux      → feux d'artifice (explosions colorées)
 *  • confettis → confettis tricolores qui pleuvent
 *  • oeufs     → œufs / fleurs de Pâques qui flottent
 *  • lune      → lune, étoiles et lanternes (Tabaski)
 *  • petales   → pétales / colombes (Carême)
 *
 * Overlay `fixed inset-0` non-cliquable (pointer-events:none) : l'application
 * reste totalement utilisable sous l'animation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Effets canvas (neige / feux / confettis)
// ─────────────────────────────────────────────────────────────────────────────
function CanvasEffect({ effet }: { effet: 'neige' | 'feux' | 'confettis' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    let raf = 0;

    // ---- NEIGE ----
    const flocons = Array.from({ length: 140 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1 + Math.random() * 3.5,
      vy: 0.6 + Math.random() * 1.8,
      vx: -0.6 + Math.random() * 1.2,
      o: 0.4 + Math.random() * 0.6,
    }));
    const drawNeige = () => {
      ctx.clearRect(0, 0, w, h);
      for (const f of flocons) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${f.o})`;
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
        f.y += f.vy;
        f.x += f.vx + Math.sin(f.y / 40) * 0.4;
        if (f.y > h + 5) { f.y = -5; f.x = Math.random() * w; }
        if (f.x > w + 5) f.x = -5;
        if (f.x < -5) f.x = w + 5;
      }
      raf = requestAnimationFrame(drawNeige);
    };

    // ---- CONFETTIS ----
    const couleurs = ['#f77f00', '#ffffff', '#009e60', '#ffd166', '#ef476f', '#118ab2'];
    const confs = Array.from({ length: 160 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h - h,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 1.5 + Math.random() * 2.5,
      vx: -1 + Math.random() * 2,
      ang: Math.random() * Math.PI,
      va: -0.1 + Math.random() * 0.2,
      c: couleurs[Math.floor(Math.random() * couleurs.length)],
    }));
    const drawConfettis = () => {
      ctx.clearRect(0, 0, w, h);
      for (const c of confs) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.ang);
        ctx.fillStyle = c.c;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
        c.y += c.vy;
        c.x += c.vx;
        c.ang += c.va;
        if (c.y > h + 10) { c.y = -10; c.x = Math.random() * w; }
      }
      raf = requestAnimationFrame(drawConfettis);
    };

    // ---- FEUX D'ARTIFICE ----
    type Part = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string };
    let particules: Part[] = [];
    const paletteFeux = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#ffffff'];
    let frame = 0;
    const exploser = () => {
      const cx = w * (0.15 + Math.random() * 0.7);
      const cy = h * (0.1 + Math.random() * 0.45);
      const c = paletteFeux[Math.floor(Math.random() * paletteFeux.length)];
      const n = 60 + Math.floor(Math.random() * 40);
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        const sp = 1.5 + Math.random() * 3.5;
        particules.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 60 + Math.random() * 40, c });
      }
    };
    const drawFeux = () => {
      // Canvas transparent : on efface simplement chaque frame pour NE PAS
      // assombrir la page (le formulaire de connexion reste parfaitement lisible).
      ctx.clearRect(0, 0, w, h);
      frame++;
      if (frame % 32 === 0) exploser();
      for (const p of particules) {
        const t = 1 - p.life / p.max;
        ctx.globalAlpha = Math.max(0, t);
        ctx.beginPath();
        ctx.fillStyle = p.c;
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03; // gravité
        p.vx *= 0.99;
        p.life++;
      }
      ctx.globalAlpha = 1;
      particules = particules.filter(p => p.life < p.max);
      raf = requestAnimationFrame(drawFeux);
    };

    if (effet === 'neige') drawNeige();
    else if (effet === 'confettis') drawConfettis();
    else { exploser(); drawFeux(); }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [effet]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9998 }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Effets emoji flottants (Pâques / Tabaski / Carême + décor de Noël)
// ─────────────────────────────────────────────────────────────────────────────
function EmojiFloat({ emojis, count = 26 }: { emojis: string[]; count?: number }) {
  const items = useRef(
    Array.from({ length: count }, (_, i) => ({
      key: i,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      left: Math.random() * 100,
      size: 18 + Math.random() * 26,
      delay: Math.random() * 8,
      dur: 8 + Math.random() * 9,
      drift: -40 + Math.random() * 80,
    })),
  ).current;

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 9998 }}>
      <style>{`
        @keyframes season-fall {
          0%   { transform: translateY(-12vh) translateX(0) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(112vh) translateX(var(--drift)) rotate(360deg); opacity: 0; }
        }
      `}</style>
      {items.map(it => (
        <span
          key={it.key}
          style={{
            position: 'absolute',
            top: 0,
            left: `${it.left}%`,
            fontSize: `${it.size}px`,
            // @ts-ignore variable CSS personnalisée
            '--drift': `${it.drift}px`,
            animation: `season-fall ${it.dur}s linear ${it.delay}s infinite`,
          }}
        >
          {it.emoji}
        </span>
      ))}
    </div>
  );
}

const EMOJI_BY_EFFET: Partial<Record<SeasonEffet, string[]>> = {
  oeufs: ['🥚', '🐰', '🌸', '🌷', '🐣', '🌼'],
  lune: ['🌙', '⭐', '🏮', '🐏', '✨', '🕌'],
  petales: ['🕊️', '🌿', '✝️', '🌸', '🕯️'],
};

export function SeasonEffects() {
  const { activeMode } = useSeason();
  const effet = activeMode?.effet;
  if (!effet || effet === 'aucun') return null;

  if (effet === 'feux' || effet === 'confettis') {
    return <CanvasEffect effet={effet} />;
  }
  if (effet === 'neige') {
    // Neige (canvas) + décorations de Noël (emojis flottants).
    return (
      <>
        <CanvasEffect effet="neige" />
        <EmojiFloat emojis={['🎄', '🎁', '⛄', '🔔', '⭐']} count={16} />
      </>
    );
  }
  const emojis = EMOJI_BY_EFFET[effet];
  return emojis ? <EmojiFloat emojis={emojis} /> : null;
}
