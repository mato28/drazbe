import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import { base } from '../../eslint.config.mjs';

const config = [
  ...nextCoreWebVitals,
  ...base,
  {
    settings: { next: { rootDir: import.meta.dirname } },
  },
];

export default config;
