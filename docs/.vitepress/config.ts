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
      {
        text: 'SDK',
        items: [
          { text: 'Overview', link: '/sdk/' },
          { text: 'Quickstart', link: '/sdk/quickstart' },
          { text: 'Dynamic UI', link: '/sdk/dynamic-ui' },
          { text: 'Cookbook', link: '/sdk/addon-cookbook' },
          { text: 'Manifest Spec', link: '/sdk/manifest-spec' },
          { text: 'Capabilities', link: '/sdk/capabilities' },
          { text: 'Consumer Guide', link: '/sdk/consumer-guide' },
          { text: 'Publishing', link: '/sdk/publishing' },
          { text: 'WASM ABI', link: '/sdk/wasm-abi' },
        ],
      },
      {
        text: 'Kernel',
        items: [
          { text: 'Overview', link: '/kernel/' },
          { text: 'Embedding Quickstart', link: '/kernel/embedding-quickstart' },
          { text: 'Dynamic System', link: '/kernel/dynamic-system' },
          { text: 'Dynamic API', link: '/kernel/dynamic-api' },
          { text: 'Permissions', link: '/kernel/permissions' },
          { text: 'Consumer Guide', link: '/kernel/consumer-guide' },
          { text: 'Dev Setup', link: '/kernel/dev-setup' },
          { text: 'Release', link: '/kernel/release' },
        ],
      },
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
          { text: 'Overview', link: '/ecosystem/' },
          { text: 'Kernel', link: '/kernel/' },
          { text: 'SDK', link: '/sdk/' },
          { text: 'Hosts', link: '/ecosystem/hosts' },
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
      '/sdk/': [
        {
          text: 'SDK',
          items: [
            { text: 'Overview', link: '/sdk/' },
            { text: 'Quickstart', link: '/sdk/quickstart' },
            { text: 'Dynamic UI', link: '/sdk/dynamic-ui' },
            { text: 'Cookbook', link: '/sdk/addon-cookbook' },
            { text: 'Manifest Spec', link: '/sdk/manifest-spec' },
            { text: 'Capabilities', link: '/sdk/capabilities' },
            { text: 'Consumer Guide', link: '/sdk/consumer-guide' },
            { text: 'Publishing', link: '/sdk/publishing' },
            { text: 'Internal Setup', link: '/sdk/internal-setup' },
            { text: 'Addon Publishing', link: '/sdk/addon-publishing' },
            { text: 'WASM ABI', link: '/sdk/wasm-abi' },
          ],
        },
      ],
      '/kernel/': [
        {
          text: 'Kernel',
          items: [
            { text: 'Overview', link: '/kernel/' },
            { text: 'Embedding Quickstart', link: '/kernel/embedding-quickstart' },
            { text: 'Dynamic System', link: '/kernel/dynamic-system' },
            { text: 'Dynamic API', link: '/kernel/dynamic-api' },
            { text: 'Permissions', link: '/kernel/permissions' },
            { text: 'Consumer Guide', link: '/kernel/consumer-guide' },
            { text: 'Dev Setup', link: '/kernel/dev-setup' },
            { text: 'Release', link: '/kernel/release' },
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
