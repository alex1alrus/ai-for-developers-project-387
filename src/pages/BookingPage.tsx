import { Alert, Stack, Text, Title } from '@mantine/core'
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { type Booking, createBooking, listEventTypes, listSlots, type Slot } from '../api'
import { BookingRequestSchema } from '../api/schemas.gen.ts'
import { errorCode, submitFailureMessage } from '../apiError.ts'
import { localDate, WINDOW_DAYS, windowDates } from '../bookingWindow.ts'
import { LoadFallback } from '../LoadFallback.tsx'
import { useLoad } from '../useLoad.ts'
import { stringError } from '../validate.ts'
import { BookingConfirmation } from './booking/BookingConfirmation.tsx'
import { BookingForm, type Guest, type GuestErrors } from './booking/BookingForm.tsx'
import { CatalogLink } from './booking/CatalogLink.tsx'
import { SlotPicker } from './booking/SlotPicker.tsx'

const schema = BookingRequestSchema.properties
const emptyGuest: Guest = { guestName: '', guestEmail: '' }
type Submission = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'failed'; message: string }

async function load(eventTypeId: string) {
  const [{ data: eventTypes }, { data: slots }] = await Promise.all([
    listEventTypes({ throwOnError: true }),
    listSlots({ path: { id: eventTypeId }, throwOnError: true }),
  ])
  const eventType = eventTypes.find((eventType) => eventType.id === eventTypeId)
  return { eventType, slots, dates: windowDates(Date.now()) }
}

function PageWithHeading({ heading = 'Выберите время', children }: { heading?: string; children: ReactNode }) {
  return (
    <Stack>
      <Title>{heading}</Title>
      {children}
    </Stack>
  )
}

export default function BookingPage() {
  const { eventTypeId = '' } = useParams()
  const { state, retry, reload } = useLoad(load, eventTypeId)
  const [goneOnSubmit, setGoneOnSubmit] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [picked, setPicked] = useState<Slot>()
  const [guest, setGuest] = useState(emptyGuest)
  const [errors, setErrors] = useState<GuestErrors>({})
  const [submission, setSubmission] = useState<Submission>({ kind: 'idle' })
  const [booked, setBooked] = useState<Booking>()

  const loaded = state.status === 'loaded' ? state.data : undefined
  const eventType = goneOnSubmit ? undefined : loaded?.eventType
  const notFound =
    goneOnSubmit ||
    (loaded !== undefined && loaded.eventType === undefined) ||
    (state.status === 'failed' && errorCode(state.error) === 'EVENT_TYPE_NOT_FOUND')

  const slotsByDate = new Map<string, Slot[]>()
  for (const slot of eventType ? loaded!.slots : []) {
    const date = localDate(new Date(slot.start))
    slotsByDate.set(date, [...(slotsByDate.get(date) ?? []), slot])
  }
  const dates = eventType ? loaded!.dates : []
  const freeDates = dates.filter((date) => slotsByDate.has(date))
  const selected = searchParams.get('date') ?? ''
  const selectDate = (date: string, replace = false) => setSearchParams({ date }, { replace })

  const needsDate = eventType !== undefined && freeDates.length > 0 && !dates.includes(selected)
  useEffect(() => {
    if (needsDate) selectDate(freeDates[0], true)
  })

  if (notFound) {
    return (
      <PageWithHeading>
        <Stack align="start">
          <Text>Тип встречи не найден</Text>
          <CatalogLink />
        </Stack>
      </PageWithHeading>
    )
  }
  if (!eventType || needsDate) {
    return (
      <PageWithHeading>
        <LoadFallback failed={state.status === 'failed'} onRetry={retry} />
      </PageWithHeading>
    )
  }

  if (booked) {
    return (
      <PageWithHeading heading="Вы записаны">
        <BookingConfirmation eventType={eventType} booking={booked} />
      </PageWithHeading>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!picked) return
    const body = {
      eventTypeId,
      start: picked.start,
      guestName: guest.guestName.trim(),
      guestEmail: guest.guestEmail.trim(),
    }
    const found: GuestErrors = {
      guestName: stringError(schema.guestName, body.guestName, 'Без переносов строки'),
      guestEmail: stringError(schema.guestEmail, body.guestEmail, 'Введите email вида name@example.com'),
    }
    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    setSubmission({ kind: 'submitting' })
    try {
      const { data } = await createBooking({ body, throwOnError: true })
      setBooked(data)
    } catch (error) {
      const code = errorCode(error)
      if (code === 'EVENT_TYPE_NOT_FOUND') {
        setGoneOnSubmit(true)
      } else if (code === 'BOOKING_CONFLICT' || code === 'INVALID_START') {
        setPicked(undefined)
        setSubmission({ kind: 'failed', message: 'Это время уже недоступно. Выберите другое.' })
        reload() // fresh slots without the loader; ?date= stays
      } else {
        setSubmission({ kind: 'failed', message: submitFailureMessage(error) })
      }
    }
  }

  const change = (key: keyof Guest) => (event: ChangeEvent<HTMLInputElement>) => {
    setGuest({ ...guest, [key]: event.currentTarget.value })
    setErrors({ ...errors, [key]: undefined })
  }

  const alert = submission.kind === 'failed' && <Alert color="red" title={submission.message} />

  return (
    <PageWithHeading>
      <Title order={2}>{eventType.title}</Title>
      <Text c="dimmed">
        {eventType.durationMinutes} мин. {eventType.description}
      </Text>
      {freeDates.length === 0 ? (
        <Stack align="start">
          <Text>В ближайшие {WINDOW_DAYS} дней свободного времени нет</Text>
          <CatalogLink />
        </Stack>
      ) : (
        <>
          <SlotPicker
            dates={dates}
            slotsByDate={slotsByDate}
            selected={selected}
            onSelectDate={selectDate}
            picked={picked}
            onPick={(slot) => {
              setPicked(slot)
              setSubmission({ kind: 'idle' })
            }}
            alert={alert}
          />
          {picked && (
            <BookingForm
              guest={guest}
              errors={errors}
              onChange={change}
              onSubmit={submit}
              submitting={submission.kind === 'submitting'}
              alert={alert}
            />
          )}
        </>
      )}
    </PageWithHeading>
  )
}
