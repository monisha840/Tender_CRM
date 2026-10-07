"use client";

import type { ComponentProps } from "react";
import { ResponsiveContainer } from "recharts";

/**
 * `ResponsiveContainer` that always has a size to start from. Recharts measures its parent after mount, and until then
 * logs "The width(-1) and height(-1) of chart should be greater than 0". Seeding an initial size removes the warning
 * and the first-paint jump. Put it inside a parent with a real height (ChartCard provides one).
 */
export function SizedContainer(props: ComponentProps<typeof ResponsiveContainer>) {
  return <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }} {...props} />;
}
