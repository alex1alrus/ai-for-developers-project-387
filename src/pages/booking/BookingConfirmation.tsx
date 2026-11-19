import { Stack, Text } from '@mantine/core'
import type { Booking, EventType } from '../../api'
import { dayMonth, time, timeZoneLabel } from '../../format.ts'
import { CatalogLink } from './CatalogLink.tsx'

export function BookingConfirmation({ eventType, booking }: { eventType: EventType; booking: Booking }) {
  const start = new Date(booking.start)
  return (
    <Stack align="start" gap="xs">
      <Text>{eventType.title}</Text>
      <Text>
        {dayMonth.format(start)}, {time.format(start)}
      </Text>
      <Text size="sm" c="dimmed">
        Часовой пояс: {timeZoneLabel(start)}
      </Text>
      <Text>{booking.guestName}</Text>
      <Text>{booking.guestEmail}</Text>
      <CatalogLink />
    </Stack>
  )
}
