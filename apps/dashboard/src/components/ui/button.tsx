import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * Button variants.
 * - `primary` / `secondary` / `ghost` — spec-aligned tones.
 * - `default` — legacy alias for `secondary` (kept for existing consumers).
 * - `danger` — destructive actions.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "default" | "danger";

export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn btn-pri",
  secondary: "btn",
  default: "btn",
  ghost: "btn btn-ghost",
  danger: "btn btn-danger",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", type = "button", className, children, ...rest },
  ref,
) {
  const cls = [VARIANT_CLASS[variant], SIZE_CLASS[size], className]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {children}
    </button>
  );
});
