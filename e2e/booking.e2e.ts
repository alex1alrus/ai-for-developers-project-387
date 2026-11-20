import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'UTC' })

// README scenario: booking, owner visibility, cancellation, and reuse of the released time.
// Real time and one shared server, so ids and names are unique per run.
test('guest books and cancels, the owner sees both statuses, and another guest books the released time', async ({ page }) => {
  const suffix = Date.now()
  const title = `Знакомство ${suffix}`
  const shorterTitle = `Короткий звонок ${suffix}`
  const shorterId = `short-${suffix}`
  const guestName = 'Анна'
  const guestEmail = `anna-${suffix}@example.com`
  const slotTime = '09:00'

  await test.step('owner creates two event types', async () => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Владельцу' }).click()
    await expect(page.getByRole('heading', { name: 'Раздел владельца' })).toBeVisible()
    await page.getByRole('tab', { name: 'Типы встреч' }).click()
    await page.getByLabel('Идентификатор').fill(`intro-${suffix}`)
    await page.getByLabel('Название').fill(title)
    await page.getByLabel('Описание').fill('Короткий созвон')
    await page.getByLabel('Длительность, мин').selectOption('45')
    await page.getByRole('button', { name: 'Создать' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Тип встречи создан' })).toBeVisible()

    await page.getByLabel('Идентификатор').fill(shorterId)
    await page.getByLabel('Название').fill(shorterTitle)
    await page.getByLabel('Длительность, мин').selectOption('30')
    await page.getByRole('button', { name: 'Создать' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Тип встречи создан' })).toBeVisible()
  })

  let slotDate = ''
  let cancellationUrl = ''
  await test.step('guest books the first free slot', async () => {
    await page.goto('/book')
    await expect(page.getByRole('heading', { name: 'Каталог типов встреч' })).toBeVisible()
    await page.getByRole('link', { name: title }).click()
    await expect(page.getByRole('heading', { name: 'Выберите время' })).toBeVisible()

    // Date buttons read like «чт, 19 нояб.»; dates without free slots are disabled.
    // Skip the first bookable date so the selected slot cannot start while the scenario runs.
    const dates = page.getByRole('button', { name: /^[а-я]{2}, \d{1,2} / })
    const date = dates.and(page.locator(':enabled')).nth(1)
    slotDate = (await date.innerText()).trim()
    await date.click()
    await page.getByRole('button', { name: slotTime, exact: true }).click()

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

  // The first slot on this future date is [09:00, 09:45). [09:30, 10:00) overlaps by 15 minutes.
  const overlappingSlot = page.getByRole('button', { name: '09:30', exact: true })
  const showShorterSlots = async () => {
    await page.goto(`/book/${shorterId}`)
    const date = page.getByRole('button', { name: slotDate, exact: true })
    await date.click()
    await expect(date).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '10:00', exact: true })).toBeVisible()
  }

  await test.step('guest explicitly cancels the booking and sees confirmation', async () => {
    await showShorterSlots()
    await expect(overlappingSlot).toHaveCount(0)

    await page.goto(cancellationUrl)
    const cancelButton = page.getByRole('button', { name: 'Отменить запись' })
    await expect(cancelButton).toBeVisible()
    const post = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/bookings/cancellation' && response.request().method() === 'POST')
    await cancelButton.click()
    const response = await post
    expect(response.status()).toBe(200)
    expect(new URL(response.url()).search).toBe('')
    expect(response.request().postDataJSON()).toEqual({ cancellationCode: cancellationUrl.split('#')[1] })
    await expect(page.getByText('Запись отменена', { exact: true })).toBeVisible()
  })

  await test.step('owner sees the same booking marked cancelled, without the secret', async () => {
    await page.goto('/owner/bookings')
    const booking = page.getByRole('listitem').filter({ hasText: title })
    await expect(booking).toContainText(`${guestName} · ${guestEmail}`)
    await expect(booking).toContainText(`, ${slotTime}–`)
    await expect(booking.getByText('Отменена', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ссылка для отмены записи' })).toHaveCount(0)
    await expect(booking).not.toContainText(cancellationUrl.split('#')[1])
  })

  await test.step('another guest books the released, partially overlapping slot', async () => {
    await showShorterSlots()
    await overlappingSlot.click()
    await page.getByLabel('Имя').fill('Борис')
    await page.getByLabel('Email').fill(`boris-${suffix}@example.com`)
    const post = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/bookings' && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Записаться' }).click()
    expect((await post).status()).toBe(201)
    await expect(page.getByRole('heading', { name: 'Вы записаны' })).toBeVisible()
  })
})
