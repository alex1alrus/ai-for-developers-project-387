import { expect, test } from '@playwright/test'

// README scenario: owner creates an event type, guest books its first free slot, owner sees the booking.
// Real time and one shared server, so ids and names are unique per run.
test('guest books an event type the owner created, and the owner sees the booking', async ({ page }) => {
  const suffix = Date.now()
  const title = `Знакомство ${suffix}`
  const guestName = 'Анна'
  const guestEmail = `anna-${suffix}@example.com`

  await test.step('owner creates an event type', async () => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Владельцу' }).click()
    await expect(page.getByRole('heading', { name: 'Раздел владельца' })).toBeVisible()
    await page.getByRole('tab', { name: 'Типы встреч' }).click()
    await page.getByLabel('Идентификатор').fill(`intro-${suffix}`)
    await page.getByLabel('Название').fill(title)
    await page.getByLabel('Описание').fill('Короткий созвон')
    await page.getByLabel('Длительность, мин').selectOption('30')
    await page.getByRole('button', { name: 'Создать' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Тип встречи создан' })).toBeVisible()
  })

  let slotTime = ''
  let cancellationUrl = ''
  await test.step('guest books the first free slot', async () => {
    await page.goto('/book')
    await expect(page.getByRole('heading', { name: 'Каталог типов встреч' })).toBeVisible()
    await page.getByRole('link', { name: title }).click()
    await expect(page.getByRole('heading', { name: 'Выберите время' })).toBeVisible()

    // Date buttons read like «чт, 19 нояб.»; dates without free slots are disabled.
    // Late in the UTC day today has no slots left, so take the first enabled date, not today.
    const dates = page.getByRole('button', { name: /^[а-я]{2}, \d{1,2} / })
    await dates.and(page.locator(':enabled')).first().click()
    const slot = page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first()
    slotTime = (await slot.textContent()) ?? ''
    await slot.click()

    await page.getByLabel('Имя').fill(guestName)
    await page.getByLabel('Email').fill(guestEmail)
    await page.getByRole('button', { name: 'Записаться' }).click()
    await expect(page.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
    await expect(page.getByText(title)).toBeVisible()
    await expect(page.getByText(guestEmail)).toBeVisible()
    const cancellationLink = page.getByRole('link', { name: 'Ссылка для отмены записи' })
    await expect(cancellationLink).toBeVisible()
    cancellationUrl = (await cancellationLink.getAttribute('href')) ?? ''
    expect(cancellationUrl).toMatch(/^\/cancel#/)
  })

  await test.step('opening and reloading the secret link shows active details without modifying the booking', async () => {
    const mutations: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) {
        mutations.push(request.method())
      }
    })
    await page.goto(cancellationUrl)
    for (let visit = 0; visit < 2; visit++) {
      await expect(page.getByRole('heading', { name: 'Детали записи' })).toBeVisible()
      await expect(page.getByText(title, { exact: true })).toBeVisible()
      await expect(page.getByText(guestEmail, { exact: true })).toBeVisible()
      await expect(page.getByText('Действующая', { exact: true })).toBeVisible()
      if (visit === 0) await page.reload()
    }
    await page.goto('/cancel#invalid')
    await expect(page.getByText('Ссылка отмены недействительна', { exact: true })).toBeVisible()
    expect(mutations).toEqual([])
  })

  await test.step('owner sees the booking', async () => {
    await page.goto('/owner/bookings')
    const booking = page.getByRole('listitem').filter({ hasText: title })
    await expect(booking).toContainText(`${guestName} · ${guestEmail}`)
    await expect(booking).toContainText(`, ${slotTime}–`)
    await expect(booking).toContainText('Действующая')
    await expect(page.getByRole('link', { name: 'Ссылка для отмены записи' })).toHaveCount(0)
    await expect(booking).not.toContainText(cancellationUrl.split('#')[1])
  })
})
