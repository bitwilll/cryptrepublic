import type { ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "ghost" | "dark" | "gold";

type ButtonAsButton = { as?: "button"; variant?: Variant } & ComponentPropsWithoutRef<"button">;
type ButtonAsAnchor = { as: "a"; variant?: Variant } & ComponentPropsWithoutRef<"a">;
export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

const cx = (variant: Variant, extra: string) => `btn btn-${variant} ${extra}`.trim();

export function Button(props: ButtonProps) {
  if (props.as === "a") {
    const { variant = "primary", className = "", as: _as, ...anchorProps } = props;
    return <a className={cx(variant, className)} {...anchorProps} />;
  }
  const { variant = "primary", className = "", as: _as, ...buttonProps } = props;
  return <button className={cx(variant, className)} {...buttonProps} />;
}
