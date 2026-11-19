import { Button, Stack, TextInput } from '@mantine/core'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'

export type Guest = { guestName: string; guestEmail: string }
export type GuestErrors = Partial<Record<keyof Guest, string>>

type Props = {
  guest: Guest
  errors: GuestErrors
  onChange: (key: keyof Guest) => (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent) => void
  submitting: boolean
  alert: ReactNode
}

/** Guest name and email for the picked slot. */
export function BookingForm({ guest, errors, onChange, onSubmit, submitting, alert }: Props) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack>
        {alert}
        <TextInput label="Имя" value={guest.guestName} onChange={onChange('guestName')} error={errors.guestName} />
        <TextInput label="Email" type="email" value={guest.guestEmail} onChange={onChange('guestEmail')} error={errors.guestEmail} />
        <Button type="submit" disabled={submitting}>
          Записаться
        </Button>
      </Stack>
    </form>
  )
}
