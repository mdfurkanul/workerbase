import { describe, it, expect } from "vitest";
import {
  ruleAllows,
  filterWriteFields,
  maskRow,
  SYSTEM_COLUMNS,
  HIDDEN_READ_COLUMNS,
} from "../../../src/core/records/recordsRouter.js";
import {
  pickDynamicDefaults,
  DEFAULT_NOW,
  DEFAULT_NOW_ON_UPDATE,
  isDynamicDateDefault,
} from "../../../src/core/collections/validation.js";
import type { FieldDefinition } from "../../../src/db/schema.js";
import type { PermissionScope } from "../../../src/db/schema.js";

/**
 * Phase 4 — Public records API unit tests.
 *
 * Pure-function tests for the rule evaluator + field maskers. Full
 * HTTP integration coverage will be added once a Workers-pool harness
 * is wired up. The patterns mirror backend/tests/core/collections.
 */

// Test principal factory helpers
const anonymous = { kind: "anonymous" as const };
const collectionUser = (recordId = "rec-1") => ({
  kind: "collection-user" as const,
  collection: "users",
  recordId,
});
const superuser = { kind: "superuser" as const, role: "admin" };

const sampleFields: FieldDefinition[] = [
  {
    id: "f1",
    name: "title",
    type: "text",
    required: true,
    unique: false,
    hidden: false,
    options: {},
  },
  {
    id: "f2",
    name: "views",
    type: "integer",
    required: false,
    unique: false,
    hidden: false,
    options: {},
  },
  {
    id: "f3",
    name: "secret",
    type: "text",
    required: false,
    unique: false,
    hidden: true,
    options: {},
  },
];

describe("ruleAllows", () => {
  // 1. Happy path — public rule allows anonymous
  it("allows anonymous when rule is 'public'", () => {
    expect(ruleAllows("public" as PermissionScope, anonymous)).toBe(true);
  });

  // 2. Auth rule denies anonymous
  it("denies anonymous when rule is 'authenticated'", () => {
    expect(ruleAllows("authenticated" as PermissionScope, anonymous)).toBe(false);
  });

  // 3. Authenticated collection user passes 'authenticated' rule
  it("allows collection-user when rule is 'authenticated'", () => {
    expect(ruleAllows("authenticated" as PermissionScope, collectionUser())).toBe(true);
  });

  // 4. Superuser always passes regardless of rule
  it("always allows superuser even for 'superuser' scope", () => {
    expect(ruleAllows("superuser" as PermissionScope, superuser)).toBe(true);
  });

  it("allows superuser even when no rule is set", () => {
    expect(ruleAllows(null, superuser)).toBe(true);
  });

  // 5. Empty/undefined rule denies everyone except superusers
  it("denies collection-user when rule is null", () => {
    expect(ruleAllows(null, collectionUser())).toBe(false);
  });

  // 6. Unknown scope string denies everyone except superuser
  it("denies for unknown scope strings", () => {
    expect(ruleAllows("weird" as PermissionScope, anonymous)).toBe(false);
    expect(ruleAllows("weird" as PermissionScope, collectionUser())).toBe(false);
  });
});

describe("filterWriteFields", () => {
  it("keeps only fields declared in the schema", () => {
    const out = filterWriteFields(
      { title: "Hi", views: 5, notAField: true },
      sampleFields,
    );
    expect(out).toEqual({ title: "Hi", views: 5 });
  });

  it("strips system columns even if they appear in payload", () => {
    const out = filterWriteFields(
      { title: "Hi", id: "hacked", created_at: 0, password_hash: "x" },
      sampleFields,
    );
    expect(out).toEqual({ title: "Hi" });
  });

  it("rejects keys with unsafe identifiers", () => {
    const out = filterWriteFields(
      { title: "Hi", "bad name": "x" },
      sampleFields,
    );
    expect(out).toEqual({ title: "Hi" });
  });

  it("returns empty when schema is null", () => {
    const out = filterWriteFields({ title: "Hi" }, null);
    expect(out).toEqual({});
  });

  it("does not require every schema field to be present", () => {
    const out = filterWriteFields({ title: "Hi" }, sampleFields);
    expect(out).toEqual({ title: "Hi" });
  });
});

describe("maskRow", () => {
  it("strips password_hash / password_salt / token_key", () => {
    const out = maskRow({
      id: "1",
      email: "a@b.io",
      password_hash: "secret",
      password_salt: "salt",
      token_key: "k",
      title: "Hi",
    });
    expect(out).toEqual({ id: "1", email: "a@b.io", title: "Hi" });
  });

  it("preserves all non-sensitive columns", () => {
    const out = maskRow({ id: "1", custom: "value" });
    expect(out).toEqual({ id: "1", custom: "value" });
  });

  it("handles empty object", () => {
    expect(maskRow({})).toEqual({});
  });
});

describe("SYSTEM_COLUMNS + HIDDEN_READ_COLUMNS", () => {
  it("includes id, created_at, password_hash in SYSTEM_COLUMNS", () => {
    expect(SYSTEM_COLUMNS.has("id")).toBe(true);
    expect(SYSTEM_COLUMNS.has("created_at")).toBe(true);
    expect(SYSTEM_COLUMNS.has("password_hash")).toBe(true);
  });

  it("does NOT mark email as a system column (it's user-writable for auth collections via register)", () => {
    expect(SYSTEM_COLUMNS.has("email")).toBe(false);
  });

  it("HIDDEN_READ_COLUMNS excludes password_hash from reads", () => {
    expect(HIDDEN_READ_COLUMNS.has("password_hash")).toBe(true);
    expect(HIDDEN_READ_COLUMNS.has("password_salt")).toBe(true);
    expect(HIDDEN_READ_COLUMNS.has("token_key")).toBe(true);
  });

  it("HIDDEN_READ_COLUMNS does not strip id or email from reads", () => {
    expect(HIDDEN_READ_COLUMNS.has("id")).toBe(false);
    expect(HIDDEN_READ_COLUMNS.has("email")).toBe(false);
  });
});

describe("pickDynamicDefaults — date/datetime sentinel defaults", () => {
  const dateFields: FieldDefinition[] = [
    {
      id: "f-created",
      name: "created_on",
      type: "datetime",
      required: false,
      unique: false,
      hidden: false,
      default: DEFAULT_NOW,
      options: {},
    },
    {
      id: "f-updated",
      name: "updated_on",
      type: "datetime",
      required: false,
      unique: false,
      hidden: false,
      default: DEFAULT_NOW_ON_UPDATE,
      options: {},
    },
    {
      id: "f-plain",
      name: "title",
      type: "text",
      required: false,
      unique: false,
      hidden: false,
      options: {},
    },
    {
      id: "f-date",
      name: "birthday",
      type: "date",
      required: false,
      unique: false,
      hidden: false,
      default: DEFAULT_NOW,
      options: {},
    },
  ];
  const NOW = 1_700_000_000;

  // 1. Happy path — INSERT fires both $now and $nowOnUpdate
  it("on insert: fills both $now and $nowOnUpdate fields", () => {
    const out = pickDynamicDefaults(dateFields, "insert", NOW);
    expect(out).toEqual({
      created_on: NOW,
      updated_on: NOW,
      birthday: NOW,
    });
  });

  // 2. Happy path — UPDATE fires only $nowOnUpdate
  it("on update: fills only $nowOnUpdate fields (not $now)", () => {
    const out = pickDynamicDefaults(dateFields, "update", NOW);
    expect(out).toEqual({ updated_on: NOW });
  });

  // 3. Validation failure — null schema returns empty
  it("returns empty when schema is null", () => {
    expect(pickDynamicDefaults(null, "insert", NOW)).toEqual({});
    expect(pickDynamicDefaults(null, "update", NOW)).toEqual({});
  });

  // 4. Edge case — non-date fields with sentinel default are ignored
  //    (defence in depth: the UI never offers these for non-date types,
  //    but if one leaks through it must not become a dynamic timestamp)
  it("ignores sentinel defaults on non-date field types", () => {
    const weird: FieldDefinition[] = [
      {
        id: "w",
        name: "title",
        type: "text",
        required: false,
        unique: false,
        hidden: false,
        default: DEFAULT_NOW,
        options: {},
      },
    ];
    expect(pickDynamicDefaults(weird, "insert", NOW)).toEqual({});
  });

  // 5. Conflict / no-op — fields without dynamic defaults produce nothing
  it("produces nothing for plain fields with no default", () => {
    const out = pickDynamicDefaults(
      [{ ...dateFields[2]!, default: undefined }],
      "insert",
      NOW,
    );
    expect(out).toEqual({});
  });
});

describe("isDynamicDateDefault", () => {
  it("recognises $now", () => {
    expect(isDynamicDateDefault(DEFAULT_NOW)).toBe(true);
  });
  it("recognises $nowOnUpdate", () => {
    expect(isDynamicDateDefault(DEFAULT_NOW_ON_UPDATE)).toBe(true);
  });
  it("rejects plain string defaults", () => {
    expect(isDynamicDateDefault("2024-01-01")).toBe(false);
    expect(isDynamicDateDefault(undefined)).toBe(false);
    expect(isDynamicDateDefault("")).toBe(false);
  });
});
