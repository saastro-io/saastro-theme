/**
 * Local type mirroring the shape consumed by the Saastro Hub. Kept inline so
 * the site has no dependency on `@saastro/cms` — the Hub reads this file via
 * static parsing, not by importing the runtime package.
 */
interface SaastroCMSConfig {
  github: {
    owner: string;
    repo: string;
    branch: string;
    contentPath: string;
  };
  admin: {
    route: string;
    siteName: string;
  };
  i18n?: {
    structure: 'multiple_folders' | 'single_folder';
    locales: string[];
    defaultLocale: string;
    translationsPath: string;
    format: 'json' | 'yaml';
    singletonPages?: boolean;
    sharedPrefixes?: string[];
  };
  collections?: Record<
    string,
    {
      name: string;
      icon?: string;
      description?: string;
      i18n?: boolean;
    }
  >;
  visualEditor?: {
    enabled: boolean;
  };
}

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
