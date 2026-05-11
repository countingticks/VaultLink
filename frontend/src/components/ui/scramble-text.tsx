import * as React from "react";

type ScrambleTextProps = {
  as?: "span" | "h2";
  className?: string;
  glyphs?: string;
  trigger?: number | string;
  value: string;
};

function ScrambleText({
  as: Component = "span",
  className,
  glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  trigger,
  value,
}: ScrambleTextProps) {
  const [display, setDisplay] = React.useState(value);

  React.useEffect(() => {
    let frame = 0;
    const totalFrames = 14;
    const interval = window.setInterval(() => {
      frame += 1;
      const progress = frame / totalFrames;
      const next = value
        .split("")
        .map((character, index) => {
          if (character === " ") return " ";
          if (index / value.length < progress) return character;
          return glyphs[Math.floor(Math.random() * glyphs.length)];
        })
        .join("");
      setDisplay(next);

      if (frame >= totalFrames) {
        window.clearInterval(interval);
        setDisplay(value);
      }
    }, 18);

    return () => window.clearInterval(interval);
  }, [glyphs, trigger, value]);

  return <Component className={className}>{display}</Component>;
}

export { ScrambleText };
