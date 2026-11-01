// Never serve server credentials or workspace-private files through development tooling.
export const privateFileDeny = [
  ".env",
  ".env.*",
  "**/*.env",
  "**/.env*",
  "*.{crt,pem,key,p12,pfx,cer,der}",
  "**/*.{crt,pem,key,p12,pfx,cer,der}",
  ".npmrc",
  ".yarnrc.yml",
  "**/.git/**",
  "**/.secrets/**",
  "**/.codex-private/**",
  "**/.config/**",
  "**/.local/**",
  "**/test-results/**",
  "**/playwright-report/**",
  "**/.cache/**",
];
