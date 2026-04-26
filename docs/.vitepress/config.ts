import { defineConfig } from 'vitepress'
import { en } from './locales/en'
import { es } from './locales/es'

export default defineConfig({
  title: 'Metacore',
  titleTemplate: ':title — Metacore',
  base: '/metacore/',
  cleanUrls: true,
  lastUpdated: true,
  appearance: 'dark',

  head: [
    ['link', { rel: 'icon', href: '/metacore/logo.svg' }],
    ['meta', { property: 'og:title', content: 'Metacore — declarative addons, zero-glue UI' }],
    ['meta', { property: 'og:image', content: '/metacore/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#14b8a6' }],
  ],

  ignoreDeadLinks: [
    /^https?:\/\//,
  ],

  locales: {
    root: { ...en },
    es: { ...es },
  },

  themeConfig: {
    logo: { src: '/logo.svg', width: 28, height: 28 },
    siteTitle: 'Metacore',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/asteby' },
    ],

    search: { provider: 'local' },
  },
})
