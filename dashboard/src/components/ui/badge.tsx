import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-elevated text-muted",
        accent: "border-accent/30 bg-accent/10 text-accent",
        danger: "border-danger/30 bg-danger/10 text-danger",
        warn: "border-warn/30 bg-warn/10 text-warn",
        success: "border-success/30 bg-success/10 text-success",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
