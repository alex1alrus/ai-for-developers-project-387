import { Anchor } from '@mantine/core'
import { Link } from 'react-router'

export function CatalogLink() {
  return (
    <Anchor component={Link} to="/book">
      В каталог
    </Anchor>
  )
}
