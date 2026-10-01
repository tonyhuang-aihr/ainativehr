import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const styles = {
    primary: "bg-primary text-white hover:bg-[#4338CA] disabled:bg-[#C7C9E8]",
    secondary: "border border-line bg-white text-ink hover:bg-[#F8F9FD]",
    ghost: "text-muted hover:bg-primarySoft hover:text-primary",
    danger: "border border-[#FECACA] bg-white text-[#B91C1C] hover:bg-[#FEF2F2]",
  }[variant];
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad" | "info" | "purple";
  children: ReactNode;
}) {
  const styles = {
    neutral: "bg-[#F2F4F7] text-[#475467]",
    good: "bg-[#ECFDF3] text-[#067647]",
    warn: "bg-[#FFFAEB] text-[#B54708]",
    bad: "bg-[#FEF3F2] text-[#B42318]",
    info: "bg-primarySoft text-[#3730A3]",
    purple: "bg-[#F5F3FF] text-[#6D28D9]",
  }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", styles)}>{children}</span>;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-2xl border border-line bg-white shadow-card", className)}>{children}</section>;
}
