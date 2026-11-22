import { useEffect, useRef } from "react";

interface AmbientNeuralFieldProps {
  intensity?: "subtle" | "vivid";
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
}

/**
 * 60fps generative neural-constellation & fluid aurora backdrop.
 * Renders a living motion-video aesthetic with zero external media dependencies.
 */
export function AmbientNeuralField({
  intensity = "subtle",
  className = "",
}: AmbientNeuralFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId = 0;
    let width = (canvas.width = canvas.offsetWidth || window.innerWidth);
    let height = (canvas.height = canvas.offsetHeight || window.innerHeight);

    const count = intensity === "vivid" ? 56 : 34;
    const maxDist = intensity === "vivid" ? 150 : 120;
    const baseAlpha = intensity === "vivid" ? 0.55 : 0.28;

    const particles: Particle[] = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.42,
      vy: (Math.random() - 0.5) * 0.42,
      radius: 1.2 + (i % 3) * 0.65,
      hue: i % 2 === 0 ? 238 : 192, // indigo & cyan spectrum
    }));

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth || window.innerWidth;
      height = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    window.addEventListener("resize", handleResize);

    let tick = 0;
    const render = () => {
      tick += 0.008;
      ctx.clearRect(0, 0, width, height);

      // Flowing aurora gradients
      const gx1 = width * (0.25 + Math.sin(tick) * 0.14);
      const gy1 = height * (0.28 + Math.cos(tick * 0.8) * 0.12);
      const grad1 = ctx.createRadialGradient(gx1, gy1, 0, gx1, gy1, Math.max(width, height) * 0.55);
      grad1.addColorStop(0, `rgba(99, 102, 241, ${intensity === "vivid" ? 0.22 : 0.1})`);
      grad1.addColorStop(1, "rgba(9, 12, 18, 0)");
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, width, height);

      const gx2 = width * (0.78 + Math.cos(tick * 0.7) * 0.12);
      const gy2 = height * (0.72 + Math.sin(tick * 0.9) * 0.12);
      const grad2 = ctx.createRadialGradient(gx2, gy2, 0, gx2, gy2, Math.max(width, height) * 0.48);
      grad2.addColorStop(0, `rgba(34, 211, 238, ${intensity === "vivid" ? 0.16 : 0.07})`);
      grad2.addColorStop(1, "rgba(9, 12, 18, 0)");
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, width, height);

      // Update & draw neural nodes
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!prefersReduced) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;
        }

        // Neural synapse lines
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.hypot(dx, dy);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * baseAlpha * 0.55;
            ctx.strokeStyle = `rgba(129, 140, 248, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }

        ctx.fillStyle = `hsla(${p.hue}, 92%, 72%, ${baseAlpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!prefersReduced) {
        animationId = window.requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationId) window.cancelAnimationFrame(animationId);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
