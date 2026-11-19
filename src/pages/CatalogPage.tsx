import { Card, Group, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'
import { listEventTypes } from '../api'
import { LoadFallback } from '../LoadFallback.tsx'
import { useLoad } from '../useLoad.ts'

const loadEventTypes = async () => (await listEventTypes({ throwOnError: true })).data

export default function CatalogPage() {
  const { state, retry } = useLoad(loadEventTypes)

  return (
    <Stack>
      <Title>Каталог типов встреч</Title>
      {state.status !== 'loaded' ? (
        <LoadFallback failed={state.status === 'failed'} onRetry={retry} />
      ) : state.data.length === 0 ? (
        <Text c="dimmed">Владелец пока не добавил типы встреч.</Text>
      ) : (
        state.data.map((eventType) => (
          <Card key={eventType.id} withBorder component={Link} to={`/book/${eventType.id}`}>
            <Group justify="space-between">
              <Title order={2} size="h4">
                {eventType.title}
              </Title>
              <Text c="dimmed">{eventType.durationMinutes} мин</Text>
            </Group>
            <Text>{eventType.description}</Text>
          </Card>
        ))
      )}
    </Stack>
  )
}
