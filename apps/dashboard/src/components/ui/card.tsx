import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div className={["card", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

interface CardSectionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardHeader({ className, children, ...rest }: CardSectionProps) {
  return (
    <div
      className={["section-h", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardTitleProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export function CardTitle({ className, children, ...rest }: CardTitleProps) {
  return (
    <span
      className={["section-t", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </span>
  );
}

export function CardBody({ className, children, style, ...rest }: CardSectionProps) {
  return (
    <div
      className={className}
      style={{ padding: "14px 16px", ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardFooter({ className, children, style, ...rest }: CardSectionProps) {
  return (
    <div
      className={className}
      style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
