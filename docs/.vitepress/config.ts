import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Metacore',
  titleTemplate: ':title — Metacore',
  description: 'Declarative addons. Zero-glue UI. Native runtime.',
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

  themeConfig: {
    logo: { src: '/logo.svg', width: 28, height: 28 },
    siteTitle: 'Metacore',

    nav: [
      { text: 'Why', link: '/why' },
      { text: 'Get Started', link: '/getting-started/' },
      { text: 'Architecture', link: '/architecture' },
      {
        text: 'Concepts',
        items: [
          { text: 'Manifest', link: '/concepts/manifest' },
          { text: 'Dynamic CRUD', link: '/concepts/dynamic-crud' },
          { text: 'Permissions', link: '/concepts/permissions' },
          { text: 'Lifecycle', link: '/concepts/lifecycle' },
          { text: 'Glossary', link: '/concepts/glossary' },
        ],
      },
      {
        text: 'Ecosystem',
        items: [
          {
            text: 'Portal',
            items: [
              { text: 'Overview', link: '/ecosystem/' },
              { text: 'Kernel', link: '/ecosystem/kernel' },
              { text: 'SDK', link: '/ecosystem/sdk' },
              { text: 'Hosts', link: '/ecosystem/hosts' },
            ],
          },
          {
            text: 'Deep docs',
            items: [
              { text: 'SDK Docs ↗', link: 'https://asteby.github.io/metacore-sdk/' },
              { text: 'Kernel Docs ↗', link: 'https://asteby.github.io/metacore-kernel/' },
            ],
          },
        ],
      },
    ],

    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Pick your path', link: '/getting-started/' },
            { text: 'Build an addon', link: '/getting-started/build-an-addon' },
            { text: 'Embed the runtime', link: '/getting-started/embed-the-runtime' },
            { text: 'Build a host', link: '/getting-started/build-a-host' },
          ],
        },
      ],
      '/concepts/': [
        {
          text: 'Concepts',
          items: [
            { text: 'Manifest', link: '/concepts/manifest' },
            { text: 'Dynamic CRUD', link: '/concepts/dynamic-crud' },
            { text: 'Permissions', link: '/concepts/permissions' },
            { text: 'Lifecycle', link: '/concepts/lifecycle' },
            { text: 'Glossary', link: '/concepts/glossary' },
          ],
        },
      ],
      '/ecosystem/': [
        {
          text: 'Ecosystem',
          items: [
            { text: 'Overview', link: '/ecosystem/' },
            { text: 'Kernel', link: '/ecosystem/kernel' },
            { text: 'SDK', link: '/ecosystem/sdk' },
            { text: 'Hosts', link: '/ecosystem/hosts' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/asteby' },
    ],

    search: { provider: 'local' },

    footer: {
      message: 'Metacore is open-source. Apache-2.0.',
      copyright: '© Asteby',
    },

    editLink: {
      pattern: 'https://github.com/asteby/metacore/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
})
