import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "ghost-danger"
  | "danger"
  | "success"
  | "icon";
type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

type ButtonAsButton = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    href?: undefined;
    target?: undefined;
  };

type ButtonAsLink = ButtonBaseProps & {
  href: string;
  target?: string;
  onClick?: () => void;
  disabled?: undefined;
  type?: undefined;
  className?: string;
  title?: string;
};

type ButtonProps = ButtonAsButton | ButtonAsLink;

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-amber-600/80 hover:bg-amber-500/80 text-amber-50 font-medium shadow-glow-amber hover:shadow-glow-amber-lg disabled:bg-gray-700 disabled:text-gray-500 disabled:shadow-none",
  secondary:
    "bg-gray-800/60 hover:bg-gray-700/60 border border-gray-600/50 hover:border-amber-500/30 text-gray-300 font-medium disabled:opacity-40",
  outline:
    "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/40 text-amber-300 font-medium disabled:opacity-40 disabled:hover:bg-amber-500/10",
  ghost: "text-gray-400 hover:text-gray-200 disabled:opacity-40",
  "ghost-danger": "text-red-400/60 hover:text-red-400 disabled:opacity-40",
  danger:
    "bg-red-950/40 hover:bg-red-900/50 border border-red-800/50 text-red-400 hover:text-red-300 font-medium disabled:opacity-40",
  success:
    "bg-emerald-600/90 hover:bg-emerald-500 text-white font-medium shadow-glow-emerald hover:shadow-glow-emerald-lg disabled:opacity-20 disabled:shadow-none",
  icon: "text-gray-500 hover:text-gray-300 disabled:opacity-40 p-1",
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "text-xs px-2.5 py-1",
  sm: "text-sm px-3 py-1.5",
  md: "text-sm px-5 py-2",
  lg: "text-sm px-6 py-3",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  const {
    variant = "primary",
    size = "md",
    fullWidth = false,
    children,
    className: extraClassName,
    ...rest
  } = props;

  const base =
    "rounded-lg transition-all duration-200 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2";
  const vStyle = variantStyles[variant];
  const sStyle = variant === "icon" ? "" : sizeStyles[size];
  const wStyle = fullWidth ? "w-full" : "";
  const className = [base, vStyle, sStyle, wStyle, extraClassName].filter(Boolean).join(" ");

  if (rest.href !== undefined) {
    const { href, target, onClick, ...linkRest } = rest as ButtonAsLink;
    return (
      <Link href={href} target={target} onClick={onClick} className={className} {...linkRest}>
        {children}
      </Link>
    );
  }

  const buttonRest = rest as Omit<ButtonAsButton, keyof ButtonBaseProps>;
  return (
    <button ref={ref} className={className} {...buttonRest}>
      {children}
    </button>
  );
});
