import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://openalternance.baptisteledev.fr',
	integrations: [
		starlight({
			title: 'OpenAlternance',
			defaultLocale: 'root',
			locales: {
				root: { label: 'Français', lang: 'fr' },
			},
			components: {
				Footer: './src/components/Footer.astro',
			},
			sidebar: [
				{
					label: 'Installation',
					items: ['installation-locale', 'installation-en-ligne'],
				},
			],
		}),
	],
});
