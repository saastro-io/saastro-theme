// n candidatos distintos y deterministas, mezcla realista de lo que trae un
// contenido nuevo: valores arbitrarios, paleta, breakpoints, dark/hover, prose.
const PATRONES = [
  (i) => `bg-[#${(0x100000 + i * 7919).toString(16).slice(-6)}]`,
  (i) => `text-[${11 + (i % 40)}px]`,
  (i) => `p-[${3 + i}px]`,
  (i) => `md:grid-cols-${1 + (i % 12)}`,
  (i) => `hover:bg-${['red', 'blue', 'green', 'amber', 'violet'][i % 5]}-${(1 + (i % 9)) * 100}`,
  (i) => `dark:text-${['slate', 'zinc', 'rose', 'sky', 'lime'][i % 5]}-${(1 + (i % 9)) * 100}`,
  (i) => `lg:w-[${1 + (i % 99)}%]`,
  (i) => `rounded-[${i % 50}px]`,
  (i) => `translate-x-[${i}px]`,
  (i) => `shadow-[0_${i % 20}px_${i % 30}px_rgba(0,0,0,0.${i % 9})]`,
  (i) => `animate-in fade-in-${i % 100}`.split(' ')[i % 2],
  (i) => `prose-${['sm', 'lg', 'xl', '2xl'][i % 4]}`,
];

export function candidatosSinteticos(n) {
  const out = new Set();
  for (let i = 0; out.size < n; i++) out.add(PATRONES[i % PATRONES.length](i));
  return [...out];
}
