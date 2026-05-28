/**
 * Type declarations for Plasmo-specific module imports.
 * These imports are resolved at build time by the Plasmo bundler,
 * but vanilla tsc doesn't know about them.
 */

declare module "data-text:*" {
  const content: string;
  export default content;
}

declare module "data-base64:*" {
  const content: string;
  export default content;
}
