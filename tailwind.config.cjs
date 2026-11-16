// Run from this repository root (Tailwind version is pinned):
// npx --yes tailwindcss@3.4.17 -c tailwind.config.cjs -i styles/tailwind-input.css -o tailwind.css --minify
module.exports = {
 content: ['./*.{html,js}'],
 theme: {extend:{}}, plugins:[], safelist:['hidden','block','flex','bg-emerald-100','text-emerald-800','bg-red-100','text-red-700']
};
