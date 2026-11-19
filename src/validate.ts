/** String limits as `@hey-api/schemas` emits them. */
type StringSchema = { readonly minLength?: number; readonly maxLength?: number; readonly pattern?: string }

/** Checks a form value against its contract schema; returns the message to show at the field. */
export function stringError(schema: StringSchema, value: string, patternMessage?: string) {
  if (schema.minLength !== undefined && value.length < schema.minLength)
    return value === '' ? 'Заполните поле' : `Не меньше ${schema.minLength} символов`
  if (schema.maxLength !== undefined && value.length > schema.maxLength) return `Не больше ${schema.maxLength} символов`
  // JSON Schema patterns are ECMA-262; Ajv on the server compiles them with the `u` flag too.
  if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) return patternMessage
  return undefined
}
