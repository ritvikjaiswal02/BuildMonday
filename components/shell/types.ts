export interface ShellUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface ShellProduct {
  id: string;
  name: string;
}

export interface ShellWorkspace {
  id: string;
  name: string;
}
