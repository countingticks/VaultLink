import { motion } from "framer-motion";

import { ScrambleText } from "@/components/ui/scramble-text";
import { cn } from "@/lib/utils";

type FlipButtonProps = {
  text1: string;
  text2: string;
  flipped?: boolean;
  onClick?: () => void;
  className?: string;
};

export function FlipButton({ text1, text2, flipped = false, onClick, className }: FlipButtonProps) {
  const label = flipped ? text2 : text1;

  return (
    <div className={cn("w-full", className)}>
      <motion.button
        type="button"
        className="vault-auth-secondary"
        onClick={onClick}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        whileTap={{ scale: 0.98 }}
      >
        <ScrambleText className="vault-auth-secondary-label" value={label} />
      </motion.button>
    </div>
  );
}
