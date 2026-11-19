import { Alert, Button, Loader } from '@mantine/core'

/** What a page shows instead of its data: a loader, or after a failed load an alert with Повторить. */
export function LoadFallback({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (!failed) return <Loader role="status" aria-label="Загрузка" />
  return (
    <Alert color="red" title="Не удалось загрузить данные">
      <Button variant="light" color="red" onClick={onRetry}>
        Повторить
      </Button>
    </Alert>
  )
}
