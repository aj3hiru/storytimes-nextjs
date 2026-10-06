import { FA_HREF } from "@/lib/assets";

/** Admin screens are full of icons: load the icon font before painting them (React hoists this into <head>). */
export function IconStyles() {
  return <link rel="stylesheet" href={FA_HREF} precedence="high" />;
}
