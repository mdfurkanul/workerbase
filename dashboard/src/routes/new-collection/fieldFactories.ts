import type { FieldType } from "@/lib/fieldTypes";
import { uuid, type Field } from "@/components/fields";

export function makeSystemFields(idType: "uuid" | "autoincrement" = "uuid"): Field[] {
  return [
    {
      cid: uuid(),
      name: "id",
      type: idType === "autoincrement" ? "integer" : "text",
      required: true,
      unique: true,
      hidden: false,
      options: {},
      locked: true,
      primaryKey: true,
    },
    {
      cid: uuid(),
      name: "created",
      type: "datetime",
      required: false,
      unique: false,
      hidden: false,
      options: { includeTime: true },
      auto: true,
    },
    {
      cid: uuid(),
      name: "updated",
      type: "datetime",
      required: false,
      unique: false,
      hidden: false,
      options: { includeTime: true },
      auto: true,
    },
  ];
}

/**
 * Auth fields shown when the collection type is "user".
 * These are auto-injected by the backend (`email` column + virtual `password`
 * that hashes into `password_hash`/`password_salt`/`token_key`). Shown locked
 * so the user knows auth collections already include them — must NOT be sent
 * in the create payload (the backend owns them).
 */
export function makeAuthFields(): Field[] {
  return [
    {
      cid: uuid(),
      name: "email",
      type: "text",
      required: true,
      unique: true,
      hidden: false,
      options: {},
      locked: true,
      auto: true,
      authField: true,
    },
    {
      cid: uuid(),
      name: "password",
      type: "text",
      required: true,
      unique: false,
      hidden: true,
      options: {},
      locked: true,
      auto: true,
      authField: true,
    },
  ];
}

export function blankField(type: FieldType): Field {
  return {
    cid: uuid(),
    name: "",
    type,
    required: false,
    unique: false,
    hidden: false,
    options: {},
  };
}
