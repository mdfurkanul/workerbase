import {
  Bug,
  Clock,
  Download,
  FolderOpen,
  Globe,
  HardDrive,
  Home,
  Key,
  Mail,
  Mailbox,
  Upload,
} from "lucide-react";

export type SectionId =
  | "application"
  | "timezone"
  | "mail"
  | "systemEmails"
  | "storage"
  | "backups"
  | "crons"
  | "apiTokens"
  | "export"
  | "import"
  | "debug";

export interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Application",
    items: [
      { id: "application", label: "Application", icon: <Home size={13} /> },
      { id: "timezone", label: "Timezone", icon: <Globe size={13} /> },
      { id: "mail", label: "Mail settings", icon: <Mail size={13} /> },
      { id: "systemEmails", label: "System emails", icon: <Mailbox size={13} /> },
      { id: "storage", label: "Files storage", icon: <FolderOpen size={13} /> },
      { id: "backups", label: "Backups", icon: <HardDrive size={13} /> },
      { id: "crons", label: "Crons", icon: <Clock size={13} /> },
      { id: "apiTokens", label: "API tokens", icon: <Key size={13} /> },
    ],
  },
  {
    label: "Sync",
    items: [
      { id: "export", label: "Export collections", icon: <Download size={13} /> },
      { id: "import", label: "Import collections", icon: <Upload size={13} /> },
    ],
  },
  {
    label: "Debug",
    items: [{ id: "debug", label: "Debug", icon: <Bug size={13} /> }],
  },
];

export const LABELS: Record<SectionId, string> = {
  application: "Application",
  timezone: "Timezone",
  mail: "Mail settings",
  systemEmails: "System emails",
  storage: "Files storage",
  backups: "Backups",
  crons: "Crons",
  apiTokens: "API tokens",
  export: "Export collections",
  import: "Import collections",
  debug: "Debug",
};
