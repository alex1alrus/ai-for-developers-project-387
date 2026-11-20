import { Alert, Button, Card, NativeSelect, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { type ChangeEvent, type FormEvent, useState } from 'react'
import { createEventType, listEventTypes } from '../api'
import { errorCode, submitFailureMessage } from '../apiError.ts'
import { EventTypeSchema } from '../api/schemas.gen.ts'
import { LoadFallback } from '../LoadFallback.tsx'
import { useLoad } from '../useLoad.ts'
import { stringError } from '../validate.ts'

const schema = EventTypeSchema.properties
const duration = schema.durationMinutes
const durationOptions = Array.from(
  { length: (duration.maximum - duration.minimum) / duration.multipleOf + 1 },
  (_, i) => String(duration.minimum + i * duration.multipleOf),
)

const emptyForm = { id: '', title: '', description: '', durationMinutes: durationOptions[0] }
type Form = typeof emptyForm
type Errors = Partial<Record<keyof Form, string>>
type Submission = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'created' } | { kind: 'failed'; message: string }

const loadEventTypes = async () => (await listEventTypes({ throwOnError: true })).data

export default function OwnerEventTypesPage() {
  const { state, retry, reload } = useLoad(loadEventTypes)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<Errors>({})
  const [submission, setSubmission] = useState<Submission>({ kind: 'idle' })

  const change = (key: keyof Form) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [key]: event.currentTarget.value })
    setErrors({ ...errors, [key]: undefined })
    if (submission.kind !== 'submitting') setSubmission({ kind: 'idle' })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const body = { ...form, title: form.title.trim(), durationMinutes: Number(form.durationMinutes) }
    const found: Errors = {
      id: stringError(schema.id, body.id, 'Только строчные латинские буквы и цифры, слова через дефис'),
      title: stringError(schema.title, body.title, 'Без переносов строки'),
      description: stringError(schema.description, body.description),
    }
    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    setSubmission({ kind: 'submitting' })
    try {
      await createEventType({ body, throwOnError: true })
      setForm(emptyForm)
      setSubmission({ kind: 'created' })
      reload()
    } catch (error) {
      if (errorCode(error) === 'EVENT_TYPE_EXISTS') {
        setErrors({ id: 'Тип встречи с таким идентификатором уже есть' })
        setSubmission({ kind: 'idle' })
      } else {
        setSubmission({ kind: 'failed', message: submitFailureMessage(error) })
      }
    }
  }

  return (
    <Stack>
      {state.status !== 'loaded' ? (
        <LoadFallback failed={state.status === 'failed'} onRetry={retry} />
      ) : state.data.length === 0 ? (
        <Text c="dimmed">Типов встреч пока нет. Создайте первый в форме ниже.</Text>
      ) : (
        state.data.map((eventType) => (
          <Card key={eventType.id} withBorder>
            <Text fw={600}>{eventType.title}</Text>
            <Text c="dimmed">
              /book/{eventType.id} · {eventType.durationMinutes} мин
            </Text>
          </Card>
        ))
      )}

      <Title order={2}>Новый тип встречи</Title>
      {submission.kind === 'created' && <Alert color="green" title="Тип встречи создан" />}
      {submission.kind === 'failed' && <Alert color="red" title={submission.message} />}
      <form onSubmit={submit} noValidate>
        <Stack>
          <TextInput label="Идентификатор" description="Часть ссылки: /book/<идентификатор>" value={form.id} onChange={change('id')} error={errors.id} />
          <TextInput label="Название" value={form.title} onChange={change('title')} error={errors.title} />
          <Textarea label="Описание" value={form.description} onChange={change('description')} error={errors.description} />
          <NativeSelect
            label="Длительность, мин"
            data={durationOptions}
            value={form.durationMinutes}
            onChange={change('durationMinutes')}
          />
          <Button type="submit" disabled={submission.kind === 'submitting'}>
            Создать
          </Button>
        </Stack>
      </form>
    </Stack>
  )
}
