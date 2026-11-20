import { Button, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { useLocation } from 'react-router'
import { cancelBooking, getBookingForCancellation, listEventTypes } from '../api'
import { errorCode } from '../apiError.ts'
import { dayMonth, time, timeZoneLabel } from '../format.ts'
import { LoadFallback } from '../LoadFallback.tsx'
import { useLoad } from '../useLoad.ts'

const invalidLink = 'Ссылка отмены недействительна'
const alreadyCancelled = 'Запись уже отменена'

type Submission =
  | { status: 'idle' | 'pending' | 'cancelled' }
  | { status: 'failed'; code: ReturnType<typeof errorCode> }

function failureMessage(code: ReturnType<typeof errorCode>) {
  switch (code) {
    case 'INVALID_CANCELLATION_CODE': return invalidLink
    case 'BOOKING_ALREADY_STARTED': return 'Запись уже началась, отменить её нельзя'
    default: return 'Не удалось отменить запись'
  }
}

async function load(code: string) {
  const { data: booking } = await getBookingForCancellation({ headers: { 'x-cancellation-code': code }, throwOnError: true })
  const { data: eventTypes } = await listEventTypes({ throwOnError: true })
  const title = eventTypes.find((eventType) => eventType.id === booking.eventTypeId)?.title ?? booking.eventTypeId
  return { booking, title }
}

function CancellationDetails({ code }: { code: string }) {
  const { state, retry } = useLoad(load, code)
  const [submission, setSubmission] = useState<Submission>({ status: 'idle' })

  async function confirmCancellation() {
    setSubmission({ status: 'pending' })
    try {
      await cancelBooking({ body: { cancellationCode: code }, throwOnError: true })
      setSubmission({ status: 'cancelled' })
    } catch (error) {
      setSubmission({ status: 'failed', code: errorCode(error) })
    }
  }

  if (state.status === 'failed' && errorCode(state.error) === 'INVALID_CANCELLATION_CODE') {
    return <Text role="alert">{invalidLink}</Text>
  }
  if (state.status !== 'loaded') return <LoadFallback failed={state.status === 'failed'} onRetry={retry} />

  const { booking, title } = state.data
  const start = new Date(booking.start)
  const wasCancelled = booking.status === 'cancelled'
    || (submission.status === 'failed' && submission.code === 'BOOKING_ALREADY_CANCELLED')
  return (
    <Stack gap="xs">
      <Text fw={600}>{title}</Text>
      <Text>{dayMonth.format(start)}, {time.format(start)}–{time.format(new Date(booking.end))}</Text>
      <Text size="sm" c="dimmed">Часовой пояс: {timeZoneLabel(start)}</Text>
      <Text>{booking.guestName}</Text>
      <Text>{booking.guestEmail}</Text>
      {submission.status === 'cancelled' ? (
        <Text role="status">Запись отменена</Text>
      ) : wasCancelled ? (
        <Text role="alert">{alreadyCancelled}</Text>
      ) : (
        <>
          <Text>Действующая</Text>
          {submission.status === 'failed' && <Text role="alert">{failureMessage(submission.code)}</Text>}
          <Button color="red" loading={submission.status === 'pending'} onClick={confirmCancellation}>
            Отменить запись
          </Button>
        </>
      )}
    </Stack>
  )
}

export default function CancellationPage() {
  const code = useLocation().hash.slice(1)
  return (
    <Stack>
      <Title>Детали записи</Title>
      <CancellationDetails key={code} code={code} />
    </Stack>
  )
}
