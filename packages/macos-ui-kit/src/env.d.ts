/**
 * Stylesheet imports.
 *
 * Every component imports its own CSS for its side effect; the declarations here
 * exist only so the type checker accepts those imports. The files are not
 * modules and export nothing.
 *
 * This is declared by the package rather than relying on `vite/client`, because
 * the kit must typecheck on its own: a consumer may use a different bundler, or
 * none, and `vite/client` is a build-tool detail that does not belong in a
 * library's requirements.
 */
declare module "*.css";
