import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const geist = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap';

export default defineConfig({
	site: 'https://openalternance.baptisteledev.fr',
	integrations: [
		starlight({
			title: 'OpenAlternance',
			logo: { src: './src/assets/logo.svg' },
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/BaptisteLOpenSource/OpenAlternance' },
				{ icon: 'external', label: 'baptisteledev.fr', href: 'https://baptisteledev.fr' },
			],
			defaultLocale: 'root',
			locales: {
				root: { label: 'Français', lang: 'fr' },
			},
			head: [
				{ tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '32x32' } },
				{ tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true } },
				{ tag: 'link', attrs: { rel: 'stylesheet', href: geist } },
			],
			customCss: ['./src/styles/tokens.css', './src/styles/starlight.css'],
			expressiveCode: {
				styleOverrides: { borderRadius: '1rem' },
			},
			components: {
				Footer: './src/components/Footer.astro',
				ThemeProvider: './src/components/ThemeProvider.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
			},
			sidebar: [
				'wiki',
				{
					label: 'Installation',
					items: ['installation-desktop', 'installation-en-ligne', 'installation-dev'],
				},
				{
					label: 'Utilisation',
					items: ['utilisation-cli', 'ia-claude-code'],
				},
			],
		}),
	],
});
