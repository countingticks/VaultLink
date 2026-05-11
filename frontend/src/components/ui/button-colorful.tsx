import * as React from "react";

import { Button } from "@/components/ui/button";
import { ScrambleText } from "@/components/ui/scramble-text";
import { cn } from "@/lib/utils";

interface ButtonColorfulProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

function ButtonColorful({
  className,
  disabled,
  label = "Explore Components",
  onPointerDown,
  ...props
}: ButtonColorfulProps) {
  const [scanActive, setScanActive] = React.useState(false);
  const scanTimeout = React.useRef<number>();

  React.useEffect(() => {
    return () => {
      if (scanTimeout.current) {
        window.clearTimeout(scanTimeout.current);
      }
    };
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    onPointerDown?.(event);

    if (event.defaultPrevented || disabled) {
      return;
    }

    setScanActive(false);
    window.requestAnimationFrame(() => setScanActive(true));

    if (scanTimeout.current) {
      window.clearTimeout(scanTimeout.current);
    }

    scanTimeout.current = window.setTimeout(() => setScanActive(false), 360);
  }

  return (
    <Button
      className={cn(
        "vault-auth-primary",
        className,
      )}
      data-click-effect={scanActive ? "true" : undefined}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      {...props}
    >
      <ScrambleText className="vault-auth-primary-label" value={label} />
    </Button>
  );
}

export { ButtonColorful };
