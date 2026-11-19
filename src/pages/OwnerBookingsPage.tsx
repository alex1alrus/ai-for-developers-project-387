import { Anchor, Card, List, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'
import { listBookings, listEventTypes } from '../api'
import { dayMonth, time } from '../format.ts'
import { LoadFallback } from '../LoadFallback.tsx'
import { useLoad } from '../useLoad.ts'

async function load() {
  const [bookings, eventTypes] = await Promise.all([listBookings({ throwOnError: true }), listEventTypes({ throwOnError: true })])
  return { bookings: bookings.data, titles: new Map(eventTypes.data.map((eventType) => [eventType.id, eventType.title])) }
}

export default function OwnerBookingsPage() {
  const { state, retry } = useLoad(load)

  if (state.status !== 'loaded') return <LoadFallback failed={state.status === 'failed'} onRetry={retry} />
  const { bookings, titles } = state.data
  if (bookings.length === 0)
    return (
      <Stack align="flex-start">
        <Text c="dimmed">Предстоящих записей нет.</Text>
        <Anchor component={Link} to="/book">
          Открыть каталог
        </Anchor>
      </Stack>
    )

  return (
    <List listStyleType="none" spacing="sm">
      {bookings.map((booking) => {
        const start = new Date(booking.start)
        return (
          <List.Item key={booking.id}>
            <Card withBorder>
              <Text fw={600}>{titles.get(booking.eventTypeId) ?? booking.eventTypeId}</Text>
              <Text>
                {dayMonth.format(start)}, {time.format(start)}–{time.format(new Date(booking.end))}
              </Text>
              <Text c="dimmed">
                {booking.guestName} · {booking.guestEmail}
              </Text>
            </Card>
          </List.Item>
        )
      })}
    </List>
  )
}
