import { Button, Group, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import type { Slot } from '../../api'
import { dayMonth, time, timeZoneLabel, weekdayDay } from '../../format.ts'

const parseLocal = (date: string) => new Date(`${date}T00:00`)

type Props = {
  dates: string[]
  slotsByDate: Map<string, Slot[]>
  selected: string
  onSelectDate: (date: string) => void
  picked: Slot | undefined
  onPick: (slot: Slot) => void
  /** Shown above the slots while no slot is picked. */
  alert: ReactNode
}

/** Date buttons of the window and the free slots of the selected date. */
export function SlotPicker({ dates, slotsByDate, selected, onSelectDate, picked, onPick, alert }: Props) {
  const slots = slotsByDate.get(selected)
  const nearest = dates.find((date) => date > selected && slotsByDate.has(date)) ?? dates.findLast((date) => slotsByDate.has(date))

  return (
    <>
      <Group gap="xs">
        {dates.map((date) => (
          <Button
            key={date}
            variant={date === selected ? 'filled' : 'default'}
            aria-pressed={date === selected}
            disabled={!slotsByDate.has(date)}
            onClick={() => onSelectDate(date)}
          >
            {weekdayDay.format(parseLocal(date))}
          </Button>
        ))}
      </Group>
      {!picked && alert}
      {slots ? (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Время указано в вашем часовом поясе: {timeZoneLabel(new Date(slots[0].start))}
          </Text>
          <Group gap="xs">
            {slots.map((slot) => (
              <Button
                key={slot.start}
                variant={slot.start === picked?.start ? 'filled' : 'light'}
                aria-pressed={slot.start === picked?.start}
                onClick={() => onPick(slot)}
              >
                {time.format(new Date(slot.start))}
              </Button>
            ))}
          </Group>
        </Stack>
      ) : (
        <Stack align="start">
          <Text>На эту дату свободного времени нет</Text>
          {nearest && (
            <Button variant="light" onClick={() => onSelectDate(nearest)}>
              Ближайшая свободная дата: {dayMonth.format(parseLocal(nearest))}
            </Button>
          )}
        </Stack>
      )}
    </>
  )
}
