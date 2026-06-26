import { useCallback, useState } from "react";
import type { z } from "zod";
import {
  validateField,
  validateForm,
  type ValidationErrors,
} from "@/lib/validation";

/**
 * Manage form values, touched state, and per-field error messages driven
 * by a Zod schema. Field-level validation runs on change and blur; full-form
 * validation runs when `validateAll()` is called (typically on submit).
 */
export function useFormValidation<T extends Record<string, unknown>>(
  schema: z.ZodType<T>,
  initialValues: T,
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors<T>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  /** Update a single field value and re-validate it on change. */
  const setValue = useCallback(
    (field: keyof T, value: string) => {
      setValues((prev) => ({ ...prev, [field]: value }));
      // Live-validate only if the user has already blurred this field once,
      // so we don't nag during the very first keystrokes.
      setTouched((prevTouched) => {
        if (!prevTouched[field]) return prevTouched;
        const msg = validateField(schema, field, { ...values, [field]: value } as T);
        setErrors((prevErrors) => ({ ...prevErrors, [field]: msg }));
        return prevTouched;
      });
    },
    [schema, values],
  );

  /** Mark a field as touched and validate it (use onBlur). */
  const onBlur = useCallback(
    (field: keyof T) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      const msg = validateField(schema, field, values);
      setErrors((prev) => ({ ...prev, [field]: msg }));
    },
    [schema, values],
  );

  /** Validate every field, mark all as touched. Returns true when valid. */
  const validateAll = useCallback((): boolean => {
    const errs = validateForm(schema, values);
    setErrors(errs);
    setTouched(
      (Object.keys(values) as (keyof T)[]).reduce(
        (acc, k) => ({ ...acc, [k]: true }),
        {} as Partial<Record<keyof T, boolean>>,
      ),
    );
    return Object.keys(errs).length === 0;
  }, [schema, values]);

  /** Reset values, errors, and touched state back to the initial values. */
  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  return {
    values,
    errors,
    touched,
    setValue,
    onBlur,
    validateAll,
    reset,
    setValues,
    setErrors,
  };
}
