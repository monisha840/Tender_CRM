"use client";

import type { ComponentProps } from "react";
import { ChartTooltipContent as BaseTooltip } from "@/components/ui/chart";

/** The shared chart tooltip without the heavy `shadow-xl` (design rule: elevation comes from a thin border). */
export function ChartTooltipContent(props: ComponentProps<typeof BaseTooltip>) {
  return <BaseTooltip {...props} className="shadow-none!" />;
}
