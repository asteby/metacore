import type { LocaleSpecificConfig, DefaultTheme } from 'vitepress'

export const es: LocaleSpecificConfig<DefaultTheme.Config> = {
  label: 'Español',
  lang: 'es',
  link: '/es/',
  description: 'Addons declarativos. UI sin glue code. Runtime nativo.',

  themeConfig: {
    nav: [
      { text: 'Por qué', link: '/es/why' },
      { text: 'Empezar', link: '/es/getting-started/' },
      {
        text: 'SDK',
        items: [
          { text: 'Visión general', link: '/es/sdk/' },
          { text: 'Inicio rápido', link: '/es/sdk/quickstart' },
          { text: 'UI dinámica', link: '/es/sdk/dynamic-ui' },
          { text: 'Recetario', link: '/es/sdk/addon-cookbook' },
          { text: 'Especificación del manifest', link: '/es/sdk/manifest-spec' },
          { text: 'Capacidades', link: '/es/sdk/capabilities' },
          { text: 'Guía del consumidor', link: '/es/sdk/consumer-guide' },
          { text: 'Publicación', link: '/es/sdk/publishing' },
          { text: 'WASM ABI', link: '/es/sdk/wasm-abi' },
        ],
      },
      {
        text: 'Kernel',
        items: [
          { text: 'Visión general', link: '/es/kernel/' },
          { text: 'Inicio rápido de embedding', link: '/es/kernel/embedding-quickstart' },
          { text: 'Sistema dinámico', link: '/es/kernel/dynamic-system' },
          { text: 'API dinámica', link: '/es/kernel/dynamic-api' },
          { text: 'Permisos', link: '/es/kernel/permissions' },
          { text: 'Guía del consumidor', link: '/es/kernel/consumer-guide' },
          { text: 'Configuración de desarrollo', link: '/es/kernel/dev-setup' },
          { text: 'Release', link: '/es/kernel/release' },
        ],
      },
      { text: 'Arquitectura', link: '/es/architecture' },
      {
        text: 'Conceptos',
        items: [
          { text: 'Manifest', link: '/es/concepts/manifest' },
          { text: 'CRUD dinámico', link: '/es/concepts/dynamic-crud' },
          { text: 'Permisos', link: '/es/concepts/permissions' },
          { text: 'Ciclo de vida', link: '/es/concepts/lifecycle' },
          { text: 'Glosario', link: '/es/concepts/glossary' },
        ],
      },
      {
        text: 'Ecosistema',
        items: [
          { text: 'Visión general', link: '/es/ecosystem/' },
          { text: 'Kernel', link: '/es/kernel/' },
          { text: 'SDK', link: '/es/sdk/' },
          { text: 'Hosts', link: '/es/ecosystem/hosts' },
        ],
      },
    ],

    sidebar: {
      '/es/getting-started/': [
        {
          text: 'Empezar',
          items: [
            { text: 'Elegí tu camino', link: '/es/getting-started/' },
            { text: 'Construir un addon', link: '/es/getting-started/build-an-addon' },
            { text: 'Embeber el runtime', link: '/es/getting-started/embed-the-runtime' },
            { text: 'Construir un host', link: '/es/getting-started/build-a-host' },
          ],
        },
      ],
      '/es/concepts/': [
        {
          text: 'Conceptos',
          items: [
            { text: 'Manifest', link: '/es/concepts/manifest' },
            { text: 'CRUD dinámico', link: '/es/concepts/dynamic-crud' },
            { text: 'Permisos', link: '/es/concepts/permissions' },
            { text: 'Ciclo de vida', link: '/es/concepts/lifecycle' },
            { text: 'Glosario', link: '/es/concepts/glossary' },
          ],
        },
      ],
      '/es/ecosystem/': [
        {
          text: 'Ecosistema',
          items: [
            { text: 'Visión general', link: '/es/ecosystem/' },
            { text: 'Kernel', link: '/es/ecosystem/kernel' },
            { text: 'SDK', link: '/es/ecosystem/sdk' },
            { text: 'Hosts', link: '/es/ecosystem/hosts' },
          ],
        },
      ],
      '/es/sdk/': [
        {
          text: 'SDK',
          items: [
            { text: 'Visión general', link: '/es/sdk/' },
            { text: 'Inicio rápido', link: '/es/sdk/quickstart' },
            { text: 'UI dinámica', link: '/es/sdk/dynamic-ui' },
            { text: 'Recetario', link: '/es/sdk/addon-cookbook' },
            { text: 'Especificación del manifest', link: '/es/sdk/manifest-spec' },
            { text: 'Capacidades', link: '/es/sdk/capabilities' },
            { text: 'Guía del consumidor', link: '/es/sdk/consumer-guide' },
            { text: 'Publicación', link: '/es/sdk/publishing' },
            { text: 'Configuración interna', link: '/es/sdk/internal-setup' },
            { text: 'Publicación de addons', link: '/es/sdk/addon-publishing' },
            { text: 'WASM ABI', link: '/es/sdk/wasm-abi' },
          ],
        },
      ],
      '/es/kernel/': [
        {
          text: 'Kernel',
          items: [
            { text: 'Visión general', link: '/es/kernel/' },
            { text: 'Inicio rápido de embedding', link: '/es/kernel/embedding-quickstart' },
            { text: 'Sistema dinámico', link: '/es/kernel/dynamic-system' },
            { text: 'API dinámica', link: '/es/kernel/dynamic-api' },
            { text: 'Permisos', link: '/es/kernel/permissions' },
            { text: 'Guía del consumidor', link: '/es/kernel/consumer-guide' },
            { text: 'Configuración de desarrollo', link: '/es/kernel/dev-setup' },
            { text: 'Release', link: '/es/kernel/release' },
          ],
        },
      ],
    },

    footer: {
      message: 'Metacore es open-source. Apache-2.0.',
      copyright: '© Asteby',
    },

    editLink: {
      pattern: 'https://github.com/asteby/metacore/edit/main/docs/:path',
      text: 'Editar esta página en GitHub',
    },

    docFooter: {
      prev: 'Anterior',
      next: 'Siguiente',
    },

    outline: { label: 'En esta página' },
    lastUpdatedText: 'Última actualización',
    darkModeSwitchLabel: 'Apariencia',
    lightModeSwitchTitle: 'Cambiar a modo claro',
    darkModeSwitchTitle: 'Cambiar a modo oscuro',
    sidebarMenuLabel: 'Menú',
    returnToTopLabel: 'Volver arriba',
    langMenuLabel: 'Cambiar idioma',
  },
}
