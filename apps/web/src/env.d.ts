// The build's settings from the environment (.env.example). Both are optional: without them, signing in
// and play logs are left out of the game, and it plays exactly the same.
interface ImportMetaEnv {
  /** The Supabase project's address, like https://<project>.supabase.co. */
  readonly VITE_SUPABASE_URL?: string;
  /** The project's public (anon) key: safe in the game, as the table's own rules decide what it may do. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
