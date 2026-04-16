import type { SaastroCMSConfig } from '@saastro/cms';

const config: SaastroCMSConfig = {
  github: {
    owner: process.env.GITHUB_OWNER || 'saastro-io',
    repo: process.env.GITHUB_REPO || 'saastro-theme',
    branch: process.env.GITHUB_BRANCH || 'main',
    contentPath: 'src/content',
  },

  admin: {
    route: '/admin',
    siteName: 'Saastro Theme',
  },

  i18n: {
    structure: 'multiple_folders',
    locales: ['en', 'es'],
    defaultLocale: 'en',
    translationsPath: 'src/i18n/translations',
    format: 'json',
    singletonPages: true,
    sharedPrefixes: ['nav', 'footer', 'cookieBanner'],
  },

  collections: {
    blog: {
      name: 'Blog',
      icon: 'pen-line',
      description: 'Blog posts',
    },
    legal: {
      name: 'Legal Pages',
      icon: 'scale',
      description: 'Legal documents (privacy, cookies, terms)',
      i18n: true,
    },
  },

  visualEditor: {
    enabled: true,
  },
};

export default config;
