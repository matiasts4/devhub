import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 select-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        devhubPrimary:
          "rounded-full border border-[color:color-mix(in_srgb,var(--accent-primary)_34%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent-primary)_88%,white_12%),color-mix(in_srgb,var(--accent-secondary)_84%,black_16%))] text-[#1b140c] shadow-[0_12px_28px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.18)] hover:-translate-y-px hover:brightness-110 active:translate-y-0 active:scale-[0.985]",
        devhubGlass:
          "rounded-full border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.03)_100%)] text-[var(--text-secondary)] shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl hover:-translate-y-px hover:border-white/16 hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.11)_0%,rgba(255,255,255,0.05)_100%)] hover:text-[var(--text-primary)] active:translate-y-0 active:scale-[0.985]",
        devhubGhost:
          "rounded-full border border-transparent bg-transparent text-[var(--text-muted)] hover:border-white/10 hover:bg-white/[0.05] hover:text-[var(--text-primary)] active:scale-[0.985]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        toolbar: "h-8 px-3.5 text-[11px] gap-1.5 [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
