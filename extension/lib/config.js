// The server this copy of the extension connects to by default.
// Copies downloaded from a BuildMonday deployment have this set to that deployment.
// You can always change it on the extension's options page.
export const DEFAULT_SERVER = "https://build-monday.vercel.app";

// Downloads made while signed in carry a token for that workspace, so the
// extension connects itself on install. Empty in the repository copy.
export const DEFAULT_TOKEN = "";
