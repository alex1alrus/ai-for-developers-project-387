import { Button, List, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'

export default function HomePage() {
  return (
    <Stack align="flex-start" gap="lg">
      <Title>Запишитесь на звонок</Title>
      <Text size="lg" c="dimmed">
        Выберите тип встречи и свободный слот в ближайшие 14 дней. Регистрация не нужна.
      </Text>
      <Title order={2}>Как это работает</Title>
      <List type="ordered" spacing="xs">
        <List.Item>Выберите тип встречи.</List.Item>
        <List.Item>Выберите свободный слот.</List.Item>
        <List.Item>Оставьте имя и email.</List.Item>
      </List>
      <Button component={Link} to="/book" size="md">
        Записаться
      </Button>
    </Stack>
  )
}
