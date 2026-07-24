// Self-contained motion shim - no external deps (framer-motion not installed in this clone).
// Provides the subset of the framer-motion API the dashboard uses:
//   <motion.div initial animate transition variants> , <AnimatePresence>, and useReducedMotion.
// Animations are driven by CSS transitions so charts/cards still animate in cleanly.
import React, { useEffect, useRef, useState } from "react";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

// Resolve a framer-style prop that may be a named variant key into a style object.
function resolveVariant(value, variants) {
  if (!value) return {};
  if (typeof value === "string") return (variants && variants[value]) || {};
  return value;
}

// Map framer-ish style keys to real CSS.
function toStyle(obj = {}) {
  const s = {};
  if (obj.opacity !== undefined) s.opacity = obj.opacity;
  if (obj.x !== undefined) s.transform = `translateX(${typeof obj.x === "number" ? obj.x + "px" : obj.x})`;
  if (obj.y !== undefined) {
    const ty = `translateY(${typeof obj.y === "number" ? obj.y + "px" : obj.y})`;
    s.transform = s.transform ? `${s.transform} ${ty}` : ty;
  }
  if (obj.scale !== undefined) {
    const sc = `scale(${obj.scale})`;
    s.transform = s.transform ? `${s.transform} ${sc}` : sc;
  }
  if (obj.height !== undefined) s.height = typeof obj.height === "number" ? obj.height + "px" : obj.height;
  return s;
}

// framer passes ease as a cubic-bezier array [x1,y1,x2,y2]; convert to CSS.
function easeToCss(ease) {
  if (Array.isArray(ease) && ease.length === 4) return `cubic-bezier(${ease.join(", ")})`;
  if (typeof ease === "string") return ease;
  return "cubic-bezier(0.16, 1, 0.3, 1)";
}

function makeMotionComponent(Tag) {
  return function MotionComponent({
    initial,
    animate,
    exit, // accepted for API parity; handled by AnimatePresence
    transition,
    variants,
    delay: delayProp, // from Stagger; folded into transition, never hits the DOM
    style,
    children,
    ...rest
  }) {
    const reduced = useReducedMotion();
    const initialStyle = toStyle(resolveVariant(initial, variants));
    const animateStyle = toStyle(resolveVariant(animate, variants));
    const [current, setCurrent] = useState(reduced ? animateStyle : initialStyle);
    const raf = useRef();

    useEffect(() => {
      if (reduced) { setCurrent(animateStyle); return; }
      // next frame -> transition from initial to animate
      raf.current = requestAnimationFrame(() => setCurrent(animateStyle));
      return () => raf.current && cancelAnimationFrame(raf.current);
    }, [reduced]);

    const dur = transition?.duration ?? 0.35;
    const delay = transition?.delay ?? delayProp ?? 0;
    const ease = easeToCss(transition?.ease);
    const transitionCss = reduced
      ? "none"
      : `opacity ${dur}s ${ease} ${delay}s, transform ${dur}s ${ease} ${delay}s, height ${dur}s ${ease} ${delay}s`;

    return (
      <Tag style={{ ...style, ...current, transition: transitionCss, willChange: "opacity, transform, height" }} {...rest}>
        {children}
      </Tag>
    );
  };
}

export const motion = new Proxy(
  {},
  {
    get: (_target, tag) => makeMotionComponent(typeof tag === "string" ? tag : "div"),
  }
);

// Named component the dashboard imports directly.
export const MotionDiv = makeMotionComponent("div");

// FadeInUp: a motion element that rises + fades in. Supports `as` to pick the tag.
export function FadeInUp({ as = "div", delay = 0, children, ...rest }) {
  const Comp = makeMotionComponent(as);
  return (
    <Comp
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      {...rest}
    >
      {children}
    </Comp>
  );
}

// Stagger: wraps children, giving each a small incremental delay for a cascade effect.
export function Stagger({ as = "div", step = 0.06, children, ...rest }) {
  const Comp = makeMotionComponent(as);
  const items = React.Children.toArray(children);
  return (
    <Comp initial={{ opacity: 1 }} animate={{ opacity: 1 }} {...rest}>
      {items.map((child, i) =>
        React.isValidElement(child)
          ? React.cloneElement(child, { delay: (child.props?.delay ?? 0) + i * step, key: child.key ?? i })
          : child
      )}
    </Comp>
  );
}

// Minimal AnimatePresence: renders children; keeps the API and mounts/unmounts correctly.
export function AnimatePresence({ children }) {
  return <>{children}</>;
}

export default motion;
