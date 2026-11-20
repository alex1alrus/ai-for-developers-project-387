import { Stack, Text, Title } from '@mantine/core'
import { useLocation } from 'react-router'
import { getBookingForCancellation, listEventTypes } from '../api'
import { errorCode } from '../apiError.ts'
import { dayMonth, time, timeZoneLabel } from '../format.ts'
import { LoadFallback } from '../LoadFallback.tsx'
import { useLoad } from '../useLoad.ts'

async function load(code: string) {
  const { data: booking } = await getBookingForCancellation({ headers: { 'x-cancellation-code': code }, throwOnError: true })
  const { data: eventTypes } = await listEventTypes({ throwOnError: true })
  const title = eventTypes.find((eventType) => eventType.id === booking.eventTypeId)?.title ?? booking.eventTypeId
  return { booking, title }
}

function CancellationDetails({ code }: { code: string }) {
  const { state, retry } = useLoad(load, code)

  if (state.status === 'failed' && errorCode(state.error) === 'INVALID_CANCELLATION_CODE') {
    return <Text role="alert">Ссылка отмены недействительна</Text>
  }
  if (state.status !== 'loaded') return <LoadFallback failed={state.status === 'failed'} onRetry={retry} />

  const { booking, title } = state.data
  const start = new Date(booking.start)
  return (
    <Stack gap="xs">
      <Text fw={600}>{title}</Text>
      <Text>{dayMonth.format(start)}, {time.format(start)}–{time.format(new Date(booking.end))}</Text>
      <Text size="sm" c="dimmed">Часовой пояс: {timeZoneLabel(start)}</Text>
      <Text>{booking.guestName}</Text>
      <Text>{booking.guestEmail}</Text>
      {booking.status === 'active' && <Text>Действующая</Text>}
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
