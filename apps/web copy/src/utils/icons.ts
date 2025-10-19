/**
 * Lucide React icon paths converted to vanilla TS
 */

export const icons = {
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  gamepad:
    "M6 11.5a2.5 2.5 0 0 1 2.5-2.5H18a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H8.5a2.5 2.5 0 0 1-2.5-2.5v-5z M6 15h3 M15 15h3 M9 11v5 M15 11v5",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  messageSquare:
    "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  play: "M5 3l14 9-14 9V3z",
  zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  trophy:
    "M6 9H4.5a2.5 2.5 0 0 1 0-5H6 M18 9h1.5a2.5 2.5 0 0 0 0-5H18 M4 22h16 M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22 M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22 M18 2H6v7a6 6 0 0 0 12 0V2z",
  trendingUp: "M22 7L13.5 15.5 8.5 10.5 2 17 M16 7h6v6",
  target:
    "M22 12A10 10 0 1 1 12 2a10 10 0 0 1 10 10z M22 12A10 10 0 0 0 12 2a10 10 0 0 0 0 20 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0z M12 12h.01",
  medal:
    "M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15 M11 12 5.12 2.2 M13 12l5.88-9.8 M8 7h8 M12 17v5 M12 22a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
  send: "M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z",
  hash: "M4 9h16 M4 15h16 M10 3L8 21 M16 3l-2 18",
  lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4",
  circle: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  moreVertical:
    "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  qrCode: "M3 3h7v7H3V3z M14 3h7v7h-7V3z M14 14h7v7h-7v-7z M3 14h7v7H3v-7z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  eyeOff:
    "M2 2l20 20 M17.94 17.94C16.04 19.38 14.06 20 12 20 5 20 1 12 1 12c.8-1.6 2-3.1 3.4-4.2 M6.1 6.1C7.96 4.62 9.94 4 12 4c7 0 11 8 11 8-.4.9-1 2-1.8 2.9",
  x: "M18 6L6 18 M6 6l12 12",
};

export function createIcon(
  iconName: keyof typeof icons,
  className: string = "h-6 w-6"
): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", className);

  const paths = icons[iconName].split(" M").filter((p) => p.trim());
  paths.forEach((pathData, index) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", index === 0 ? pathData : "M" + pathData);
    svg.appendChild(path);
  });

  return svg;
}
